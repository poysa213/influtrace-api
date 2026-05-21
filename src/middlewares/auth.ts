import { NextFunction, Request, Response } from 'express';

import { StatusCodes } from 'http-status-codes';

import { getUserByDeviceId } from '~/helpers/auth';
import {
  AppError,
  createExceptionErrorResponse,
  ErrorCodes,
} from '~/utils/error';

export const parseUserFromToken = async (
  req: Request,
  _: Response,
  next: NextFunction,
) => {
  const deviceId = (req.headers['X-Device-ID'] ||
    req.headers['X-Device-ID'.toLowerCase()]) as string;
  if (!deviceId) return next();

  req.user = await getUserByDeviceId(deviceId);

  return next();
};

const unauthenticatedError = new AppError({
  message: 'Unauthorized',
  status: StatusCodes.UNAUTHORIZED,
  code: ErrorCodes.UNAUTHENTICATED,
});

const internalUserOnlyError = new AppError({
  message: 'Access restricted to internal users only',
  status: StatusCodes.FORBIDDEN,
  code: ErrorCodes.UNAUTHORIZED,
});

export const ensureUserIsAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req?.user) throw unauthenticatedError;
    return next();
  } catch (error) {
    return createExceptionErrorResponse(res, error);
  }
};

export const ensureUserIsInternal = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req?.user) throw unauthenticatedError;
    if (!req.user.isInternal) throw internalUserOnlyError;
    return next();
  } catch (error) {
    return createExceptionErrorResponse(res, error);
  }
};
