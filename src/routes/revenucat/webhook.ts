import { Request, Response, Router } from 'express';

import { env } from '~/utils/env';

import { User } from '../../models/user';
import { discordService } from '../../services/discord.service';
import { subscriptionService } from '../../services/subscription.service';
import { fileLogger } from '../../utils/logger';

const router = Router();

// RevenueCat webhook secret from environment variable
const WEBHOOK_SECRET = env.REVENUECAT_WEBHOOK_SECRET;

router.post('/', async (req: Request, res: Response) => {
  try {
    // Check for authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      fileLogger.warning('revenueCat', {
        message: 'Invalid or missing authorization header',
        authHeader: authHeader ? 'present' : 'missing',
      });
      return void res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body.event;
    const appUserId = event.app_user_id;
    const store = event.store;
    const productId = event.product_id;
    const newProductId = event.new_product_id;
    const transactionId = event.transaction_id;
    const countryCode = event.country_code;
    const type = event.type;
    let color = 0x00ff00; // Default green

    // Log webhook for debugging and track in App Insights for analytics
    const webhookData = {
      eventType: type,
      appUserId,
      store,
      productId,
      newProductId,
      countryCode,
      transactionId,
      environment: event.environment,
      price: event.price,
      currency: event.currency,
    };
    
    fileLogger.info('revenueCat', webhookData);

    if (!appUserId) {
      fileLogger.warning('revenueCat', {
        message: 'Missing app_user_id in event',
        bodyStructure: req.body,
      });
      return void res.status(400).json({ error: 'Missing app_user_id' });
    }

    // Get user by deviceId (which is the app_user_id from RevenueCat)
    let user = await User.findOne({ deviceId: appUserId });
    
    // HOTFIX: If user not found, try to find by transaction history or create new user
    if (!user) {
      // Try to find by aliases if available
      if (event.aliases && event.aliases.length > 0) {
        for (const alias of event.aliases) {
          user = await User.findOne({ deviceId: alias });
          if (user) {
            fileLogger.info('revenueCat', {
              message: 'Found user by alias, updating deviceId',
              oldDeviceId: alias,
              newDeviceId: appUserId,
            });
            user.deviceId = appUserId;
            await user.save();
            break;
          }
        }
      }
      
      // If still not found, create new user for this deviceId
      if (!user) {
        fileLogger.info('revenueCat', {
          message: 'Creating new user for webhook',
          appUserId,
          aliases: event.aliases,
        });
        user = new User({
          deviceId: appUserId,
          hasFreeSubscription: false,
        });
        await user.save();
      }
    }
    
    if (!user) {
      fileLogger.warning('revenueCat', {
        message: 'User not found in database',
        appUserId,
        originalAppUserId: event.original_app_user_id,
        searchQuery: { deviceId: appUserId },
      });
      return void res.status(404).json({ error: 'User not found' });
    }

    const subscription = await subscriptionService.updateSubscription(
      appUserId,
      {
        type,
        productId,
        newProductId,
        store,
        transactionId,
        countryCode,
      },
    );

    if (!subscription) {
      return void res.status(404).json({ error: 'User not found' });
    }

    // Get user's location and deviceId
    const location = user.location;
    const deviceId = user.deviceId;

    // Set color based on event type
    switch (type) {
      case 'CANCELLATION':
      case 'BILLING_ISSUE':
      case 'EXPIRATION':
        color = 0xff0000; // Red
        break;
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_PAUSED':
        color = 0xffa500; // Orange
        break;
      case 'PRODUCT_CHANGE':
        color = 0x0000ff; // Blue
        break;
      case 'TRANSFER':
        color = 0x9932cc; // Purple
        break;
    }

    // Send Discord notification
    await discordService.sendRevenueCatNotification({
      userId: appUserId,
      eventType: type,
      productId: productId,
      store: store,
      countryCode: countryCode,
      location: location,
      deviceId: deviceId,
      color: color,
      environment: event.environment,
    });

    return void res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing RevenueCat webhook:', error);
    fileLogger.error('revenueCat', { error });
    
    return void res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
