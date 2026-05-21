declare module 'expo-server-sdk' {
  export class Expo {
    constructor(options?: { accessToken?: string });
    isExpoPushToken(token: string): boolean;
    chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
    sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  }

  export interface ExpoPushMessage {
    to: string | string[];
    data?: object;
    title?: string;
    body?: string;
    sound?: 'default' | null;
    ttl?: number;
    expiration?: number;
    priority?: 'default' | 'normal' | 'high';
    subtitle?: string;
    channelId?: string;
    badge?: number;
  }

  export interface ExpoPushTicket {
    id: string;
    status: 'ok' | 'error';
    message?: string;
    details?: {
      error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
    };
  }
} 