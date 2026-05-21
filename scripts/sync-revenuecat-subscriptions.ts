import { config } from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../src/models/user';
import { env } from '../src/utils/env';
import { logger } from '../src/utils/logger';

config();

const REVENUECAT_API_KEY = env.REVENUECAT_SECRET_KEY;
const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';
const DRY_RUN = process.argv.includes('--dry-run');

// Parse arguments
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const MAX_USERS = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const DAYS_LOOKBACK = daysArg ? parseInt(daysArg.split('=')[1]) : null;

interface RevenueCatSubscription {
  expires_date: string | null;
  purchase_date: string;
  original_purchase_date: string;
  store: string;
  product_identifier: string;
}

interface RevenueCatSubscriber {
  subscriber: {
    entitlements: {
      [key: string]: {
        expires_date: string | null;
        purchase_date: string;
        product_identifier: string;
      };
    };
    subscriptions: {
      [key: string]: RevenueCatSubscription;
    };
  };
}

async function fetchRevenueCatSubscriber(appUserId: string): Promise<RevenueCatSubscriber | null> {
  try {
    const response = await fetch(`${REVENUECAT_API_URL}/subscribers/${appUserId}`, {
      headers: {
        'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`RevenueCat API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logger.error(`Failed to fetch subscriber ${appUserId}:`, error);
    return null;
  }
}

function hasActiveSubscription(subscriber: RevenueCatSubscriber): boolean {
  const entitlements = subscriber.subscriber.entitlements;
  
  // Check if there are any active entitlements
  for (const [key, entitlement] of Object.entries(entitlements)) {
    const expiresDate = entitlement.expires_date;
    
    // Null means lifetime subscription or active
    if (!expiresDate) {
      return true;
    }
    
    // Check if not expired
    const expiresTimestamp = new Date(expiresDate).getTime();
    if (expiresTimestamp > Date.now()) {
      return true;
    }
  }
  
  return false;
}

async function syncSubscriptions() {
  try {
    if (DRY_RUN) {
      logger.info('🔍 DRY RUN MODE - No changes will be saved to database');
    }
    
    if (DAYS_LOOKBACK) {
      logger.info(`🔍 Looking for users updated in last ${DAYS_LOOKBACK} days (limit: ${MAX_USERS})`);
    } else {
      logger.info(`🔍 Looking for all users without subscription (limit: ${MAX_USERS})`);
    }
    
    // Connect to MongoDB
    await mongoose.connect(env.DATABASE_URL);
    logger.info('Connected to MongoDB');

    // Build query
    const query: any = {
      $and: [
        { hasFreeSubscription: { $ne: true } },
        {
          $or: [
            { subscription: null },
            { 'subscription.isActive': { $ne: true } },
          ],
        },
      ],
    };

    // Add date filter if specified (filter by last activity, not creation)
    if (DAYS_LOOKBACK) {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - DAYS_LOOKBACK);
      query.$and.push({ updatedAt: { $gte: dateThreshold } });
    }

    // Find users without active subscription in DB
    const users = await User.find(query)
      .sort({ updatedAt: -1 }) // Most recently active first
      .limit(MAX_USERS);

    const filterInfo = DAYS_LOOKBACK 
      ? `updated after ${new Date(Date.now() - DAYS_LOOKBACK * 24 * 60 * 60 * 1000).toISOString()}`
      : 'all time';
    
    logger.info(`Found ${users.length} users without active subscription (${filterInfo})`);

    let syncedCount = 0;
    let errorCount = 0;
    let noSubCount = 0;

    for (const user of users) {
      try {
        // Fetch from RevenueCat
        const rcData = await fetchRevenueCatSubscriber(user.deviceId);
        
        if (!rcData) {
          noSubCount++;
          continue;
        }

        // Check if has active subscription
        if (!hasActiveSubscription(rcData)) {
          noSubCount++;
          continue;
        }

        // Get subscription details - find the most recent active subscription
        const subscriptions = rcData.subscriber.subscriptions;
        
        // Find active (not expired) subscription with the latest purchase_date
        let activeSubscription: RevenueCatSubscription | null = null;
        let activeProductId: string | null = null;
        
        for (const [productId, sub] of Object.entries(subscriptions)) {
          const expiresDate = sub.expires_date ? new Date(sub.expires_date) : null;
          const isActive = !expiresDate || expiresDate > new Date();
          
          if (isActive) {
            if (!activeSubscription || new Date(sub.purchase_date) > new Date(activeSubscription.purchase_date)) {
              activeSubscription = sub;
              activeProductId = productId;
            }
          }
        }

        if (!activeSubscription || !activeProductId) {
          logger.warn(`No active subscription found for user ${user.deviceId}`);
          noSubCount++;
          continue;
        }

        // Update user in MongoDB
        user.subscription = {
          type: activeProductId,
          isActive: true,
          productId: activeProductId,
          store: activeSubscription.store,
          transactionId: activeSubscription.original_purchase_date,
          updatedAt: new Date(),
        };

        if (!DRY_RUN) {
          await user.save();
        }
        syncedCount++;

        logger.info(`${DRY_RUN ? '🔍' : '✅'} ${DRY_RUN ? 'Would sync' : 'Synced'} subscription for user ${user.deviceId} (${activeProductId})`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        logger.error(`Failed to process user ${user.deviceId}:`, error);
      }
    }

    logger.info('========================================');
    logger.info(`Sync completed ${DRY_RUN ? '(DRY RUN)' : ''}:`);
    if (DAYS_LOOKBACK) {
      logger.info(`  - Time filter: users active in last ${DAYS_LOOKBACK} days`);
    }
    logger.info(`  - ${DRY_RUN ? 'Would sync' : 'Synced'}: ${syncedCount} users`);
    logger.info(`  - No subscription: ${noSubCount} users`);
    logger.info(`  - Errors: ${errorCount} users`);
    logger.info('========================================');
    
    if (DRY_RUN) {
      logger.info('ℹ️  To actually sync, run without --dry-run flag');
      logger.info('ℹ️  Options: --days=N (filter by activity), --limit=N (max users to check)');
    }

    process.exit(0);
  } catch (error) {
    logger.error('Sync failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

syncSubscriptions();

