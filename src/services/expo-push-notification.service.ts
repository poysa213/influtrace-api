import { Expo, ExpoPushMessage } from 'expo-server-sdk';

import { User } from '~/models/user';

import { logger } from '~/utils/logger';

class PushNotificationService {
  private static instance: PushNotificationService;
  private expo: Expo;

  private constructor() {
    this.expo = new Expo();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async updatePushToken(userId: string, token: string): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, { pushNotificationToken: token });
      logger.info('[PushNotification] Push notification token updated', {
        userId,
      });
    } catch (error) {
      logger.error(
        '[PushNotification] Failed to update push notification token',
        {
          error,
          userId,
        },
      );
      throw error;
    }
  }

  async sendNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user?.pushNotificationToken) {
        logger.warn(
          '[PushNotification] No push notification token found for user',
          { userId },
        );
        return;
      }

      const message: ExpoPushMessage = {
        to: user.pushNotificationToken,
        sound: 'default',
        title,
        body,
        data: data || {},
      };

      const chunks = this.expo.chunkPushNotifications([message]);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          logger.error(
            '[PushNotification] Error sending push notification chunk',
            {
              error,
              userId,
            },
          );
        }
      }

      logger.info('[PushNotification] Push notification sent', {
        userId,
        tickets,
      });
    } catch (error) {
      logger.error('[PushNotification] Failed to send push notification', {
        error,
        userId,
      });
      throw error;
    }
  }
}

export const pushNotificationService = PushNotificationService.getInstance();
