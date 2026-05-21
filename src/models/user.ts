import { model, Schema } from 'mongoose';

import { addSchemaPlugins, Document, Model } from '~/plugins/mongoose';

export interface IUserEvent {
  _id?: Schema.Types.ObjectId;
  type: 'unfollow';
  username: string;
  fullName?: string;
  profilePicUrl?: string;
  detectedAt: Date;
  pushed: boolean;
}

export interface ISubscription {
  type: string;
  isActive: boolean;
  productId: string;
  store: string;
  transactionId: string;
  countryCode?: string;
  updatedAt: Date;
}

export interface IUser extends Document {
  deviceId: string;
  instagramHandle?: string;
  instagramUsername?: string;
  followersCount?: number;
  profilePicUrl?: string;
  followowingCount?: number;
  subscription?: ISubscription;
  hasFreeSubscription: boolean;
  pushNotificationToken?: string;
  isOneSignalIntegrated: boolean;
  isInternal: boolean;
  location?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

type UserModel = Model<IUser>;

const SubscriptionSchema = new Schema<ISubscription>(
  {
    type: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    productId: {
      type: String,
      required: true,
    },
    store: {
      type: String,
      required: true,
    },
    transactionId: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      required: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

export const UserSchema = new Schema<IUser, UserModel>(
  {
    deviceId: { type: String, required: true, unique: true },
    instagramHandle: { type: String },
    instagramUsername: { type: String },
    followowingCount: { type: Number },
    followersCount: { type: Number },
    profilePicUrl: { type: String },
    subscription: { type: SubscriptionSchema },
    hasFreeSubscription: { type: Boolean, default: false },
    pushNotificationToken: { type: String },
    isOneSignalIntegrated: { type: Boolean, default: false },
    location: { type: String },
    isInternal: { type: Boolean, default: false },
    ip: { type: String, default: '' },
  },
  { timestamps: true },
);

// @ts-expect-error type casting mismatch from mongoose
addSchemaPlugins(UserSchema);

export const User = model<IUser, UserModel>('User', UserSchema, 'users');
