import { User } from '~/models';
import axios from 'axios';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

import { discordService } from './discord.service';
import { notificationService } from './notification.service';

import { IPLocation } from '~/types/interfaces';

export class UserService {
  async initializeUser(
    deviceId: string,
    pushNotificationToken?: string,
    ip?: string,
  ) {
    let user = await User.findOne({ deviceId });
    const isNewUser = !user;

    // Check if we need to update IP and location
    const shouldUpdateIpAndLocation =
      isNewUser || (user && ip && (!user.ip || user.ip !== ip));

    // Fetch location data if needed
    let locationInfo = user?.location || 'Unknown';
    if (shouldUpdateIpAndLocation && ip) {
      const locationData = await this.fetchUserLocation(ip);
      if (locationData.status === 'success') {
        locationInfo = `${locationData.city}, ${locationData.regionName}, ${locationData.country} (${locationData.countryCode})`;
      }
    }

    if (isNewUser) {
      // Create new user
      user = await User.create({
        deviceId,
        location: locationInfo,
        ip,
      });
      await this.handleNewUserNotification(deviceId, locationInfo, ip);
    } else if (user && shouldUpdateIpAndLocation && ip) {
      // Update existing user if IP changed or was added
      user.ip = ip;
      user.location = locationInfo;
      await user.save();
    }

    if (pushNotificationToken && user?._id) {
      await this.updatePushNotificationToken(
        user._id.toString(),
        pushNotificationToken,
      );
    }

    return user;
  }

  private async fetchUserLocation(ip?: string): Promise<Partial<IPLocation>> {
    if (!ip) return {};

    try {
      const response = await axios.get<IPLocation>(
        `http://pro.ip-api.com/json/${ip}?key=${env.IP_API_KEY}`,
        { timeout: 5000 }, // 5 seconds timeout
      );
      if (response.data.status === 'success') {
        return response.data;
      }
      return {};
    } catch (error) {
      logger.error('Failed to fetch IP location data', { error, ip });
      return {};
    }
  }

  private async handleNewUserNotification(
    deviceId: string,
    locationInfo: string,
    ip?: string,
  ) {
    try {
      await discordService.sendInstallNotification(
        deviceId,
        locationInfo,
        deviceId,
      );
      logger.info('New user install notification sent', {
        userId: deviceId,
        location: locationInfo,
        ip,
      });
    } catch (error) {
      logger.error('Failed to send install notification', {
        error,
        userId: deviceId,
        location: locationInfo,
        ip,
      });
    }
  }

  private async updatePushNotificationToken(userId: string, token: string) {
    try {
      await notificationService.updatePushToken(userId, token);
    } catch (error) {
      logger.error('Failed to update push notification token', {
        error,
        userId,
      });
    }
  }

  async getUserById(userId: string) {
    return User.findById(userId);
  }
}

export const userService = new UserService();
