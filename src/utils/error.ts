import { Response } from 'express';

import { AxiosError } from 'axios';
import { getReasonPhrase, StatusCodes } from 'http-status-codes';

/**
 * error code description
 * 13330: middleware errors on the app level, like cors error, not authorized on the app level etc
 * 13331: User is not authenticated and access token is not valid or provided
 * 13332: User is authenticated but not authorized to access the resource
 * 13333: Showable error message to frontend. it may used on the reusable frontend request method to show toast without repeating
 * 13334: Showable error message in sense of success. for example, a user is authenticated and trying to login again. User is already login, this type of message will be coded with 13334
 * 13335: validation error. for this type of error, validationErrors will be provided as a key value pair
 * 13336: unknown error
 * 13337: unknown error
 * 0: code doesn't has any value
 */

export enum ErrorCodes {
  MIDDLEWARE_ERROR = 13330,
  UNAUTHENTICATED = 13331,
  UNAUTHORIZED = 13332,
  SHOWABLE_ERROR = 13333,
  SHOWABLE_SUCCESS = 13334,
  VALIDATION_ERROR = 13335,
  UNKNOWN_ERROR_A = 13336,
  UNKNOWN_ERROR_B = 13337,
  NO_CODE = 0,
}

type AppErrorConstructor = {
  message?: string;
  title?: string;
  code?: ErrorCodes;
  status?: StatusCodes;
  reason?: string;
  validationErrors?: Record<string, any>;
  key?: string;
};

export class AppError {
  title: string;
  message: string;
  code: ErrorCodes;
  status: StatusCodes;
  reason?: string;
  validationErrors?: Record<string, any>;
  key?: string;

  constructor(error: AppErrorConstructor) {
    const defaultStatusCode = StatusCodes.BAD_REQUEST;

    this.message =
      error?.message !== undefined ? error.message : 'Server Error';
    this.code =
      error?.code !== undefined ? error.code : ErrorCodes.SHOWABLE_ERROR;
    this.status =
      error?.status !== undefined ? error.status : defaultStatusCode;
    this.title =
      error.title !== undefined ? error.title : getReasonPhrase(this.status);
    if (error?.reason !== undefined) this.reason = error.reason;
    if (error?.validationErrors !== undefined)
      this.validationErrors = error.validationErrors;
    if (error?.key !== undefined) this.key = error.key;
  }
}

const createExceptionError = (
  res: Response,
  error: any,
  track: boolean = true,
) => {
  if (error instanceof AppError) {
    return void res.status(error.status).send(error);
  }

  if (error instanceof AxiosError) {
    return void res.status(error.response?.status || 500).send(error);
  }

  if ('code' in error && error.code === 11000) {
    const message = Object.keys(error?.keyPattern || {}).reduce((r, key) => {
      return `${r} ${key}${
        error?.keyValue[key] ? `: ${error?.keyValue[key]}` : ''
      },`;
    }, 'duplicated');

    return void res.status(StatusCodes.CONFLICT).send(
      new AppError({
        title: getReasonPhrase(StatusCodes.CONFLICT),
        message: message.slice(0, -1),
        code: ErrorCodes.SHOWABLE_ERROR,
        status: StatusCodes.CONFLICT,
      }),
    );
  }

  if (error instanceof Error) {
    return void res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(
      new AppError({
        title: getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR),
        message: error.message,
        code: ErrorCodes.SHOWABLE_ERROR,
        status: StatusCodes.INTERNAL_SERVER_ERROR,
      }),
    );
  }

  return void res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(error);
};

export const createExceptionErrorResponse = (
  res: Response,
  error: any,
  track: boolean = true,
) => {
  return createExceptionError(res, error, track);
};

export const createValidationError = (errors: Record<string, any>) => {
  return new AppError({
    message: 'Validation Error',
    code: ErrorCodes.VALIDATION_ERROR,
    status: StatusCodes.FORBIDDEN,
    validationErrors: errors,
  });
};

export const createValidationErrorResponse = (
  res: Response,
  errors: Record<string, any>,
  track: boolean = true,
) => {
  const appError = createValidationError(errors);
  return createExceptionErrorResponse(res, appError, track);
};
