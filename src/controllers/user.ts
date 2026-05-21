import { Request, Response } from 'express';

import { IUser } from '~/models';

import { getAppConfig } from '~/models/app_conf';
import { notificationService } from '~/services/notification.service';
import { userService } from '~/services/user.service';

import { arePrivateProfilesAllowed } from '~/helpers/instagram';
import {
  createExceptionErrorResponse,
  createValidationErrorResponse,
} from '~/utils/error';
import { validateData } from '~/utils/validation';

import { initSchema } from '~/support/validation-schema/user';

export const init = async (req: Request, res: Response) => {
  try {
    const { validated, data, errors } = await validateData(
      initSchema,
      req.body,
    );
    if (!validated) {
      return createValidationErrorResponse(res, errors);
    }

    const ip =
      (req.headers['x-ip'] as string) ||
      req.ip ||
      req.socket.remoteAddress ||
      'Unknown';

    // strip the ip address from any port numbers or anything else
    const ipRegex = /(\d{1,3}\.){3}\d{1,3}/;
    const match = ip.match(ipRegex);
    const cleanIp = match ? match[0] : ip;

    const user = await userService.initializeUser(
      data.uid,
      data.pushNotificationToken || undefined,
      cleanIp,
    );

    const appConf = await getAppConfig();

    return void res.send({
      ...user?.toJSON(),
      hasSubscription:
        user?.hasFreeSubscription ||
        (!user?.subscription ? false : user?.subscription.isActive),
      subscription: undefined,
      p_allowed: arePrivateProfilesAllowed({
        appConf,
        user: user as IUser,
      }),
    });
  } catch (error) {
    return createExceptionErrorResponse(res, error);
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    return void res.send(req?.user);
  } catch (error) {
    return createExceptionErrorResponse(res, error);
  }
};

export const markOneSignalIntegrated = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    await notificationService.markUserAsOneSignalIntegrated(
      user._id.toString(),
    );

    return void res.send({
      success: true,
      message: 'User marked as OneSignal integrated',
    });
  } catch (error) {
    return createExceptionErrorResponse(res, error);
  }
};
