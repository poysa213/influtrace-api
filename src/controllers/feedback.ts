import { Request, Response } from 'express';

import { Feedback } from '~/models/feedbacks';
import { discordService } from '~/services/discord.service';

import { createExceptionErrorResponse } from '~/utils/error';
import { logger } from '~/utils/logger';
import { validateData } from '~/utils/validation';

import { profileLinkingFeedbackSchema } from '~/support/validation-schema/profile-linking-feedback';
import { appFeedbackSchema } from '~/support/validation-schema/app-feedback';
import { appFeedbackTextSchema } from '~/support/validation-schema/app-feedback-text';

const profileLinkingFeedbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { validated, data, errors } = await validateData(
      profileLinkingFeedbackSchema,
      req.body,
    );

    if (!validated) {
      return void res.status(400).json({
        code: 'invalid_username',
        message: 'Invalid Instagram username',
        detail: errors.username,
      });
    }

    const { feedback } = data;

    // Save feedback to DB
    await Feedback.create({
      userId: user._id,
      feedback,
      type: 'account_linking',
    });

    await discordService.sendProfileLinkingFeedback({
      userId: user._id?.toString?.() || 'unknown',
      feedback,
      deviceId: user.deviceId,
      location: user.location,
      instagramUsername: user.instagramUsername,
      profilePicUrl: user.profilePicUrl,
    });

    return void res.status(200).json();
  } catch (error) {
    logger.error('Unexpected error in profileLinkingFeedback:', error);
    return createExceptionErrorResponse(res, error);
  }
};

const appFeedbackHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { validated, data, errors } = await validateData(
      appFeedbackSchema,
      req.body,
    );

    if (!validated) {
      return void res.status(400).json({
        code: 'invalid_feedback',
        message: 'Invalid feedback data',
        detail: errors,
      });
    }

    const { liked } = data;

    await discordService.sendAppFeedback({
      userId: user._id?.toString?.() || 'unknown',
      liked,
      deviceId: user.deviceId,
      location: user.location,
      instagramUsername: user.instagramUsername,
      profilePicUrl: user.profilePicUrl,
    });

    return void res.status(200).json();
  } catch (error) {
    logger.error('Unexpected error in appFeedback:', error);
    return createExceptionErrorResponse(res, error);
  }
};

const appFeedbackTextHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { validated, data, errors } = await validateData(
      appFeedbackTextSchema,
      req.body,
    );

    if (!validated) {
      return void res.status(400).json({
        code: 'invalid_feedback',
        message: 'Invalid feedback data',
        detail: errors,
      });
    }

    const { feedback } = data;

    // Save feedback to DB with app type
    await Feedback.create({
      userId: user._id,
      feedback,
      type: 'app',
    });

    await discordService.sendAppFeedbackText({
      userId: user._id?.toString?.() || 'unknown',
      feedback,
      deviceId: user.deviceId,
      location: user.location,
      instagramUsername: user.instagramUsername,
      profilePicUrl: user.profilePicUrl,
    });

    return void res.status(200).json();
  } catch (error) {
    logger.error('Unexpected error in appFeedbackText:', error);
    return createExceptionErrorResponse(res, error);
  }
};

export { profileLinkingFeedbackHandler, appFeedbackHandler, appFeedbackTextHandler };
