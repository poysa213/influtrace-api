import { RequestHandler } from 'express';

import { StatusCodes } from 'http-status-codes';

import { analyzeService } from '~/services/analyze.service';
import { discordService } from '~/services/discord.service';

import {
  AppError,
  createExceptionErrorResponse,
  ErrorCodes,
} from '~/utils/error';
import { logger } from '~/utils/logger';

import { AnalysisResult } from '~/types/analysis';

export const analyzeByUsername: RequestHandler = async (req, res) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  const isPro = false;

  try {
    try {
      discordService
        .sendAnalysisStarted({
          username,
          userId: req.user?._id?.toString(),
          deviceId: req.user?.deviceId,
          context: 'api:postAnalyze',
        })
        .catch((e) => logger.warn('[Discord] sendAnalysisStarted failed', e));
    } catch (e) {
      logger.warn('[Discord] sendAnalysisStarted call threw', e);
    }

    let analysis: AnalysisResult;

    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!isPro) {
      analysis = await analyzeService.analyzePremium(username, userId);
    } else {
      analysis = await analyzeService.analyzeLite(username, userId);
    }

    const { fromCache, ...analysisResponse } = analysis;
    res.json({ analysis: analysisResponse });

    try {
      discordService
        .sendAnalysisSuccess({
          username,
          userId: req.user?._id?.toString(),
          deviceId: req.user?.deviceId,
          context: 'api:postAnalyze',
          analysisId: analysis?.id,
          fromCache: analysis?.fromCache,
        })
        .catch((e) => logger.warn('[Discord] sendAnalysisSuccess failed', e));
    } catch (e) {
      logger.warn('[Discord] sendAnalysisSuccess call threw', e);
    }
    return;
  } catch (error) {
    if (error instanceof AppError) {
      if ((error as any).status === StatusCodes.FORBIDDEN) {
        const forbiddenError = new AppError({
          message: error.message,
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.FORBIDDEN,
          key: 'private_profile',
        });
        return createExceptionErrorResponse(res, forbiddenError);
      }

      if ((error as any).status === StatusCodes.NOT_FOUND) {
        const notFoundError = new AppError({
          message: error.message,
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.NOT_FOUND,
          key: 'profile_not_found',
        });
        return createExceptionErrorResponse(res, notFoundError);
      }
    }

    if (error instanceof Error && (error as any).status === 403) {
      const forbiddenError = new AppError({
        message: error.message,
        code: ErrorCodes.SHOWABLE_ERROR,
        status: StatusCodes.FORBIDDEN,
        key: 'private_profile',
      });
      return createExceptionErrorResponse(res, forbiddenError);
    }

    if (error instanceof Error && (error as any).status === 404) {
      const notFoundError = new AppError({
        message: error.message,
        code: ErrorCodes.SHOWABLE_ERROR,
        status: StatusCodes.NOT_FOUND,
        key: 'profile_not_found',
      });
      return createExceptionErrorResponse(res, notFoundError);
    }

    try {
      discordService
        .sendAnalysisError({
          username,
          userId: req.user?._id?.toString(),
          deviceId: req.user?.deviceId,
          context: 'api:postAnalyze',
          errorMessage: error instanceof Error ? error.message : String(error),
          details:
            error instanceof Error
              ? { name: error.name, stack: error.stack }
              : error,
        })
        .catch((e) => logger.warn('[Discord] sendAnalysisError failed', e));
    } catch (e) {
      logger.warn('[Discord] sendAnalysisError call threw', e);
    }

    return createExceptionErrorResponse(res, error);
  }
};
