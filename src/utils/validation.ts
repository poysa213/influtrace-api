import { isValid, parse } from 'date-fns';
import { Types } from 'mongoose';
import { InferType, Schema, TestContext, ValidationError } from 'yup';

export type YupValidationData = Record<string, any>;
export type YupValidationError = Record<string, string | undefined>;
export type YupValidationResult<T> =
  | {
      validated: true;
      data: T;
      errors?: never;
    }
  | {
      validated: false;
      data?: never;
      errors: YupValidationError;
    };

export const validateData = async <S extends Schema>(
  schema: S,
  value: any,
): Promise<YupValidationResult<InferType<S>>> => {
  try {
    const data = await schema.validate(value, {
      abortEarly: false,
      stripUnknown: false,
    });

    return {
      validated: true,
      data,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        validated: false,
        errors: error.inner.reduce((prev, err, index) => {
          const { path, message } = err;
          if (!message) return prev;
          return { ...prev, [path ? path : index]: message };
        }, {}),
      };
    }
    return {
      validated: false,
      errors: {},
    };
  }
};

export const requiredIfExists = (
  value: any,
  { createError, path }: TestContext,
) => {
  if (value === undefined) return true;
  if (!value) return createError({ message: `${path} is required` });
  return true;
};

export const isValidDate = (skipUndefined: boolean = false) => {
  return (value: any, { createError, path }: TestContext) => {
    if (skipUndefined && value === undefined) return true;
    const date = new Date(value);

    if (!isValid(date)) {
      return createError({ message: `${path} is not valid date` });
    }
    return true;
  };
};

export const validateDateWithFormat = (dateFormat: string) => {
  return (value: any, { createError, path }: TestContext) => {
    const date = parse(value, dateFormat, new Date());
    if (!isValid(date)) {
      return createError({
        message: `${path} is not valid date of format ${dateFormat}`,
      });
    }
    return true;
  };
};

export const isObjectId = (skipUndefined = false, message = null) => {
  return (value: any, { createError, path }: TestContext) => {
    if (skipUndefined && value === undefined) return true;
    const isValid = Types.ObjectId.isValid(value);
    if (!value || !isValid) {
      return createError({
        message: message ? message : `${path} is not a valid object id`,
      });
    }
    return true;
  };
};
