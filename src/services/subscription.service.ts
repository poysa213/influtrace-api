import { ISubscription, User } from '../models/user';

export class SubscriptionService {
  async updateSubscription(
    appUserId: string,
    event: {
      type: string;
      productId: string;
      newProductId?: string;
      store: string;
      transactionId: string;
      countryCode?: string;
    },
  ): Promise<ISubscription | null> {
    // Look up user by deviceId (which is the app_user_id from RevenueCat)
    const user = await User.findOne({ deviceId: appUserId });
    if (!user) {
      return null;
    }

    let subscription: ISubscription = {
      type: event.productId,
      isActive: true,
      productId: event.productId,
      store: event.store,
      transactionId: event.transactionId,
      ...(event.countryCode && { countryCode: event.countryCode }),
      updatedAt: new Date(),
    };

    // Handle each event type separately
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
        user.subscription = subscription;
        break;

      case 'CANCELLATION':
        if (user.subscription) {
          //user.subscription.isActive = false;
        }
        break;

      case 'UNCANCELLATION':
        if (user.subscription) {
          user.subscription.isActive = true;
        }
        break;

      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_PAUSED':
        if (user.subscription) {
          user.subscription.isActive = false;
        }
        break;

      case 'BILLING_ISSUE':
      case 'EXPIRATION':
        if (user.subscription) {
          user.subscription.isActive = false;
        }
        break;

      case 'PRODUCT_CHANGE':
        if (event.newProductId) {
          subscription = {
            type: event.newProductId,
            isActive: true,
            productId: event.newProductId,
            store: event.store,
            transactionId: event.transactionId,
            ...(event.countryCode && { countryCode: event.countryCode }),
            updatedAt: new Date(),
          };
          user.subscription = subscription;
        }
        break;

      case 'SUBSCRIPTION_EXTENDED':
        if (user.subscription) {
          user.subscription.isActive = true;
        }
        break;

      case 'TRANSFER':
        if (user.subscription) {
          user.subscription.isActive = true;
          user.subscription.transactionId = event.transactionId;
          user.subscription.updatedAt = new Date();
        } else {
          user.subscription = subscription;
        }
        break;
    }

    await user.save();
    return user.subscription || null;
  }
}

export const subscriptionService = new SubscriptionService();
