import { User } from '~/models/user';

import { logger } from '~/utils/logger';

import { pushNotificationService } from './expo-push-notification.service';
import { oneSignalService } from './onesignal.service';

class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async sendNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        logger.warn('[Notification] User not found', { userId });
        return;
      }

      let notificationSent = false;
      let lastError: Error | null = null;

      // Try OneSignal first for integrated users
      if (user.isOneSignalIntegrated) {
        try {
          logger.info('[Notification] Sending via OneSignal', { userId });
          await oneSignalService.sendNotification(userId, title, body, data);
          notificationSent = true;
          logger.info(
            '[Notification] OneSignal notification sent successfully',
            { userId },
          );
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error('OneSignal failed');
          logger.error('[Notification] OneSignal notification failed', {
            error: lastError.message,
            userId,
          });
        }
      }

      // Fallback to Expo Push Notifications if OneSignal failed or user is not integrated
      if (!notificationSent && user.pushNotificationToken) {
        try {
          logger.info('[Notification] Sending via Expo Push Notifications', {
            userId,
          });
          await pushNotificationService.sendNotification(
            userId,
            title,
            body,
            data,
          );
          notificationSent = true;
          logger.info(
            '[Notification] Expo Push notification sent successfully',
            { userId },
          );
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error('Expo Push failed');
          logger.error('[Notification] Expo Push notification failed', {
            error: lastError.message,
            userId,
          });
        }
      }

      if (!notificationSent) {
        if (
          !user.isOneSignalIntegrated &&
          !user.pushNotificationToken &&
          user.pushNotificationToken !== ''
        ) {
          logger.warn(
            '[Notification] No notification service available for user',
            {
              userId,
              hasOneSignal: user.isOneSignalIntegrated,
              hasExpoPushToken: !!user.pushNotificationToken,
            },
          );
        } else {
          logger.error('[Notification] All notification services failed', {
            userId,
            lastError: lastError?.message,
          });
          throw lastError || new Error('All notification services failed');
        }
      }
    } catch (error) {
      logger.error('[Notification] Failed to send notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  async updatePushToken(userId: string, token: string): Promise<void> {
    try {
      await pushNotificationService.updatePushToken(userId, token);
    } catch (error) {
      logger.error('[Notification] Failed to update push token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw error;
    }
  }

  async markUserAsOneSignalIntegrated(userId: string): Promise<void> {
    try {
      await oneSignalService.markUserAsOneSignalIntegrated(userId);
    } catch (error) {
      logger.error(
        '[Notification] Failed to mark user as OneSignal integrated',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        },
      );
      throw error;
    }
  }

  async isUserOneSignalIntegrated(userId: string): Promise<boolean> {
    try {
      return await oneSignalService.isUserOneSignalIntegrated(userId);
    } catch (error) {
      logger.error(
        '[Notification] Failed to check OneSignal integration status',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId,
        },
      );
      return false;
    }
  }

  /**
   * Send notifications for multiple events to a single user
   * Uses the same logic as the snapshot service cron
   * @param user - User object
   * @param trackedUser - TrackedUser object
   * @param events - Array of events to send notifications for
   */
  async sendNotifications(
    user: any,
    trackedUser: any,
    events: any[],
  ): Promise<void> {
    try {
      if (!events || events.length === 0) {
        logger.info('[Notification] No events to send notifications for');
        return;
      }

      logger.info('[Notification] Processing notifications for events', {
        userId: user._id.toString(),
        username: trackedUser.instagramUsername,
        eventCount: events.length,
      });

      // If 5 or fewer events, send individual notifications
      if (events.length <= 5) {
        await this.sendIndividualNotifications(user, trackedUser, events);
      } else {
        // Send summary notification for more than 5 events
        await this.sendSummaryNotification(user, trackedUser, events);
      }

      logger.info('[Notification] Successfully sent notifications', {
        userId: user._id.toString(),
        eventCount: events.length,
      });
    } catch (error) {
      logger.error('[Notification] Failed to send notifications for events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user._id.toString(),
        eventCount: events.length,
      });
      throw error;
    }
  }

  /**
   * Send individual notifications for each event (≤5 events)
   */
  private async sendIndividualNotifications(
    user: any,
    trackedUser: any,
    events: any[],
  ): Promise<void> {
    for (const event of events) {
      try {
        const { title, body } = this.getNotificationContent(event, trackedUser);

        await this.sendNotification(user._id.toString(), title, body, {
          type: event.type,
          eventId: event._id,
          instagramUsername: trackedUser.instagramUsername,
          profilePictureUrl: trackedUser.profilePictureUrl,
        });

        logger.debug('[Notification] Individual notification sent', {
          userId: user._id.toString(),
          eventType: event.type,
          targetUsername: event.username,
        });
      } catch (error) {
        logger.error('[Notification] Failed to send individual notification', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: user._id.toString(),
          eventType: event.type,
        });
        // Continue with other notifications even if one fails
      }
    }
  }

  /**
   * Send summary notification for multiple events (>5 events)
   */
  private async sendSummaryNotification(
    user: any,
    trackedUser: any,
    events: any[],
  ): Promise<void> {
    // Aggregate events by type
    const eventCounts = events.reduce(
      (acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Build summary message
    const parts = [];
    if (eventCounts['follow']) {
      parts.push(`${eventCounts['follow']} new following`);
    }
    if (eventCounts['unfollow']) {
      parts.push(`${eventCounts['unfollow']} unfollowing`);
    }
    if (eventCounts['followBy']) {
      parts.push(`${eventCounts['followBy']} new followers`);
    }
    if (eventCounts['unfollowBy']) {
      parts.push(`${eventCounts['unfollowBy']} unfollowers`);
    }

    const summaryBody = `@${trackedUser.instagramUsername} has ${parts.join(', ')}`;

    await this.sendNotification(
      user._id.toString(),
      'Activity Summary',
      summaryBody,
      {
        type: 'summary',
        eventIds: events.map((e) => e._id),
        instagramUsername: trackedUser.instagramUsername,
      },
    );

    logger.info('[Notification] Summary notification sent', {
      userId: user._id.toString(),
      eventCounts,
      totalEvents: events.length,
    });
  }

  /**
   * Get notification title and body for individual events
   */
  private getNotificationContent(
    event: any,
    trackedUser: any,
  ): { title: string; body: string } {
    const targetUsername = event.username || 'Unknown';
    const instagramUsername = trackedUser.instagramUsername;

    switch (event.type) {
      case 'follow':
        return {
          title: 'New Follow',
          body: `@${instagramUsername} is now following @${targetUsername}`,
        };
      case 'unfollow':
        return {
          title: 'Unfollowed',
          body: `@${instagramUsername} unfollowed @${targetUsername}`,
        };
      case 'followBy':
        return {
          title: 'New Follower',
          body: `@${instagramUsername} got followed by @${targetUsername}`,
        };
      case 'unfollowBy':
        return {
          title: 'Lost Follower',
          body: `@${instagramUsername} got unfollowed by @${targetUsername}`,
        };
      default:
        return {
          title: 'Instagram Activity',
          body: `@${instagramUsername} has new activity`,
        };
    }
  }
}

export const notificationService = NotificationService.getInstance();
