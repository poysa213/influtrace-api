import { Document, model, Schema, Types } from 'mongoose';

export interface IPerformanceNotificationPreference extends Document {
  userId: Types.ObjectId | string;
  subscriptionId: string;
  username?: string;
  status: 'enabled' | 'disabled';
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PerformanceNotificationPreferenceSchema =
  new Schema<IPerformanceNotificationPreference>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
      subscriptionId: {
        type: String,
        required: true,
        index: true,
      },
      username: {
        type: String,
        required: false,
      },
      status: {
        type: String,
        enum: ['enabled', 'disabled'],
        required: true,
        default: 'enabled',
      },
      source: {
        type: String,
        required: false,
      },
    },
    { timestamps: true },
  );

PerformanceNotificationPreferenceSchema.index({ userId: 1, username: 1 });
PerformanceNotificationPreferenceSchema.index({ subscriptionId: 1, status: 1 });

export const PerformanceNotificationPreference =
  model<IPerformanceNotificationPreference>(
    'PerformanceNotificationPreference',
    PerformanceNotificationPreferenceSchema,
    'performance_notification_preferences',
  );
