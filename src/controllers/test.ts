import { RequestHandler } from 'express';

import { notificationService } from '~/services/notification.service';

import { createExceptionErrorResponse } from '~/utils/error';
import { logger } from '~/utils/logger';

export const test: RequestHandler = async (req, res) => {
  try {
    return void res.send({ test: true });
  } catch (error) {
    console.log('error', error);
    return createExceptionErrorResponse(res, error);
  }
};

export const pingNotification: RequestHandler = async (req, res) => {
  const user = req.user!;

  // log user
  logger.info('[Test] User pinged notification', {
    userId: user._id.toString(),
    deviceId: user.deviceId,
    location: user.location,
  });

  await notificationService.sendNotification(
    user._id.toString(),
    'Pong',
    'This is a test notification',
    {
      profilePictureUrl: 'https://github.com/shadcn.png',
    },
  );

  res.status(200).json({ message: 'Pong' });
};
