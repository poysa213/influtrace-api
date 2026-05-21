import { Request } from 'express';

import crypto from 'crypto';
import { round } from 'lodash';

/**
 * --------------------------------------------------------------------------------
 * generate random string of given length
 * --------------------------------------------------------------------------------
 */
export const generateRandomString = (length: number = 32) => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * --------------------------------------------------------------------------------
 * generate random number of given length
 * --------------------------------------------------------------------------------
 */
export const generateRandomNumber = (
  digit: number = 6,
  asString: boolean = false,
) => {
  const number = parseInt((Math.random() * Math.pow(10, digit))?.toString());
  if (asString) return number;
  return number.toString().padStart(digit, '0');
};

/**
 * --------------------------------------------------------------------------------
 * checks a variable and whether it is json parsable
 * --------------------------------------------------------------------------------
 */
export const isJsonParsable = (string: unknown): string is string => {
  try {
    if (typeof string !== 'string') return false;
    const parsed = JSON.parse(string);
    return Boolean(parsed);
  } catch {
    return false;
  }
};

/**
 * --------------------------------------------------------------------------------
 * checks a variable and whether it is number
 * --------------------------------------------------------------------------------
 */
export const isNumber = (data: unknown): data is number => {
  if (typeof data !== 'number') return false;
  return !isNaN(parseFloat(String(data))) && isFinite(data);
};

/**
 * --------------------------------------------------------------------------------
 * format number to accounting format
 * --------------------------------------------------------------------------------
 */
export const formatToAccountingNumber = (
  number: string | number,
  precision = 2,
  negativeNumbersOnAccountFormat = false,
) => {
  if (typeof number === 'string') number = parseFloat(number);
  if (!isNumber(number)) return number;
  number = round(number, precision);

  const decimalPlaces = number.toString().split('.')[1]?.length || 0;
  const options = {
    minimumFractionDigits: decimalPlaces > 0 ? decimalPlaces : 0,
    maximumFractionDigits: precision,
  };
  const formatter = new Intl.NumberFormat('en-US', options);
  const formattedNumber = formatter.format(Math.abs(number));

  if ((number as number) >= 0) return formattedNumber;
  return negativeNumbersOnAccountFormat
    ? `(${formattedNumber})`
    : `-${formattedNumber}`;
};

/**
 * --------------------------------------------------------------------------------
 * get referer url from express request object
 * --------------------------------------------------------------------------------
 */
export const getRefererUrl = (req: Request, fallback?: string) => {
  const referrer = req.headers.referer;

  if (!referrer) {
    return fallback || '';
  }

  const url = new URL(referrer);
  let baseUrl = `${url.protocol}//${url.host}`;
  if (baseUrl?.slice(-1) === '/') baseUrl = baseUrl?.slice(0, -1);

  return baseUrl;
};
