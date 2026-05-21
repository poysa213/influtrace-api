import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';

import { UserProfile } from '~/services/hiker.service';

import { ErrorCodes } from '~/utils/error';

import { EventTypes, Gender } from './index';

// User related interfaces
export interface ISubscription {
  type: string;
  isActive: boolean;
  productId: string;
  store: string;
  transactionId: string;
  countryCode?: string;
  updatedAt: Date;
}

// Instagram related interfaces
export interface IInstagramUser {
  pk: string;
  id: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_private: boolean;
  is_verified: boolean;
}

export interface IFollower {
  id: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_private?: boolean;
  is_verified?: boolean;
  gender: Gender;
  biography?: string;
  is_business?: boolean;
}

// Event related interfaces
export interface IEvent {
  _id: Types.ObjectId;
  type: EventTypes;
  instagramHandle: string;
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
  detectedAt: Date;
  pushed?: boolean;
}

export interface IUserEvent {
  type: EventTypes;
  instagramHandle: string;
  detectedAt: Date;
}

// Pagination and Query related types
export type PaginationResult<T = any> = {
  data: T[];
  firstPage: number;
  currentPage: number;
  lastPage: number | null;
  total: number | null;
  from: number;
  to: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// Validation related types
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

// Error related types
export type AppErrorConstructor = {
  message?: string;
  title?: string;
  code?: ErrorCodes;
  status?: StatusCodes;
  reason?: string;
  validationErrors?: Record<string, any>;
  key?: string;
};

//  IP Location related interfaces
export interface IPLocation {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

export interface ProfileValidationError {
  success: boolean;
  status: number;
  response: {
    code: string;
    message: string;
    details?: string;
    profile?: UserProfile;
    p_allowed?: boolean;
  };
}

export interface ProfileValidationSuccess {
  success: boolean;
  profile: UserProfile; // You might want to type this more specifically based on your profile structure
}

export type ProfileValidationResult =
  | ProfileValidationError
  | ProfileValidationSuccess;
