import axios, { AxiosRequestConfig } from 'axios';

import { User } from '~/models/user';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

interface OneSignalNotificationPayload {
  app_id: string;
  include_external_user_ids: string[];
  target_channel: string;
  mutable_content: boolean;
  contents: {
    en: string;
  };
  data?: Record<string, any>;
  headings?: {
    en: string;
  };
}

class OneSignalService {
  private static instance: OneSignalService;
  private readonly apiUrl = 'https://api.onesignal.com/notifications';
  private readonly appId = env.ONESIGNAL_APP_ID;
  private readonly apiKey = env.ONESIGNAL_API_KEY;

  private constructor() {}

  public static getInstance(): OneSignalService {
    if (!OneSignalService.instance) {
      OneSignalService.instance = new OneSignalService();
    }
    return OneSignalService.instance;
  }

  async markUserAsOneSignalIntegrated(userId: string): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, { isOneSignalIntegrated: true });
      logger.info('[OneSignal] User marked as OneSignal integrated', {
        userId,
      });
    } catch (error) {
      logger.error('[OneSignal] Failed to mark user as OneSignal integrated', {
        error,
        userId,
      });
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
      if (!user?.deviceId) {
        logger.warn('[OneSignal] No device ID found for user', { userId });
        return;
      }

      const payload: OneSignalNotificationPayload = {
        app_id: this.appId,
        include_external_user_ids: [user.deviceId],
        target_channel: 'push',
        mutable_content: true,
        contents: {
          en: body,
        },
        data: {
          name: title,
          url: data?.profilePictureUrl || undefined,
        },
      };

      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Key ${this.apiKey}`,
        },
      };

      const response = await axios.post(this.apiUrl, payload, config);

      logger.info('[OneSignal] Notification sent successfully', {
        userId,
        response: response.data,
        status: response.status,
      });
    } catch (error) {
      logger.error('[OneSignal] Failed to send notification', {
        error,
        userId,
      });
      throw error;
    }
  }

  async isUserOneSignalIntegrated(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      return user?.isOneSignalIntegrated || false;
    } catch (error) {
      logger.error('[OneSignal] Failed to check OneSignal integration status', {
        error,
        userId,
      });
      return false;
    }
  }
}

export const oneSignalService = OneSignalService.getInstance();
