import { Request, Response } from 'express';

import { PerformanceNotificationPreference } from '~/models/performance_notification_preference';
import { User } from '~/models/user';
import { discordService } from '~/services/discord.service';
import { notificationService } from '~/services/notification.service';

import { createExceptionErrorResponse } from '~/utils/error';
import { logger } from '~/utils/logger';
import { validateData } from '~/utils/validation';

import { oneSignalNotificationSchema } from '~/support/validation-schema/one-signal-notification';
import { updatePerformanceNotificationSchema } from '~/support/validation-schema/performance-notification';

const sendSelfNotificationkHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { validated, data } = await validateData(
      oneSignalNotificationSchema,
      req.body,
    );

    if (!validated) {
      return void res.status(400).json({
        code: 'invalid_data',
        message: 'Invalid OneSignal notification data',
      });
    }

    const { title, body, profilePictureUrl } = data;

    await notificationService.sendNotification(
      user._id.toString(),
      title,
      body,
      { profilePictureUrl },
    );

    await discordService.sendSelfNotificationLog({
      userId: user._id.toString(),
      title,
      body,
      profilePictureUrl,
      deviceId: user.deviceId,
      location: user.location,
      instagramUsername: user.instagramUsername,
    });

    return void res.status(200).json({ success: true });
  } catch (error) {
    logger.error(
      'Unexpected error in when sending a self OneSignal notification:',
      error,
    );
    return createExceptionErrorResponse(res, error);
  }
};

const updatePerformanceNotificationHandler = async (
  req: Request,
  res: Response,
) => {
  try {
    const user = req.user;
    if (!user) {
      return void res.status(401).json({
        code: 'unauthorized',
        message: 'User authentication required',
      });
    }

    const { validated, data } = await validateData(
      updatePerformanceNotificationSchema,
      req.body,
    );

    if (!validated) {
      return void res.status(400).json({
        code: 'invalid_data',
        message: 'Invalid data provided',
      });
    }

    const { subscriptionId, username, source, enabled } = data;

    if (!username) {
      return void res.status(400).json({
        code: 'invalid_data',
        message: 'Username is required',
      });
    }

    const userId = user._id.toString();
    const normalizedUsername = username.toLowerCase();

    const existingPreference = await PerformanceNotificationPreference.findOne({
      userId: user._id,
      username: normalizedUsername,
    });

    const status = enabled ? 'enabled' : 'disabled';
    let preference;

    if (existingPreference) {
      existingPreference.status = status;
      existingPreference.username = normalizedUsername;
      if (subscriptionId) {
        existingPreference.subscriptionId = subscriptionId;
      }
      if (source) {
        existingPreference.source = source;
      }
      preference = await existingPreference.save();

      logger.info(
        `[Performance Notification] Preference updated to ${status}`,
        {
          userId,
          subscriptionId: existingPreference.subscriptionId,
          username: normalizedUsername,
          source,
          enabled,
        },
      );
    } else {
      preference = await PerformanceNotificationPreference.create({
        userId: user._id,
        subscriptionId: subscriptionId || 'unknown',
        username: normalizedUsername,
        status,
        source,
      });

      logger.info(
        `[Performance Notification] New preference created as ${status}`,
        {
          userId,
          subscriptionId,
          username: normalizedUsername,
          source,
          enabled,
        },
      );
    }

    return void res.status(200).json({
      success: true,
      message: `Performance report notifications ${status}`,
      subscriptionId: preference.subscriptionId,
      status,
      enabled,
    });
  } catch (error) {
    logger.error(
      '[Performance Notification] Error updating notification preference:',
      error,
    );
    return createExceptionErrorResponse(res, error);
  }
};

export { sendSelfNotificationkHandler, updatePerformanceNotificationHandler };
