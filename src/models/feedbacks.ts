import { Document, model, Schema, Types } from 'mongoose';

export interface IFeedback extends Document {
  userId: Types.ObjectId | string;
  feedback: string;
  type?: 'app' | 'account_linking';
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    feedback: { type: String, required: true },
    type: {
      type: String,
      enum: ['app', 'account_linking'],
      default: 'account_linking',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Feedback = model<IFeedback>(
  'Feedback',
  FeedbackSchema,
  'feedbacks',
);
