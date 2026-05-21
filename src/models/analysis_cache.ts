import { model, Schema } from 'mongoose';

import { addSchemaPlugins, Document, Model } from '~/plugins/mongoose';

import { AnalysisResult } from '~/types/analysis';

export interface IAnalysisCache extends Document {
  username: string;
  isPremium: boolean;
  result: AnalysisResult;
  createdAt: Date;
  expiresAt: Date;
}

const AnalysisCacheSchema = new Schema<IAnalysisCache>(
  {
    username: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    isPremium: {
      type: Boolean,
      required: true,
      default: false,
    },
    result: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: 'analysis_cache',
    timestamps: false,
  },
);

// Compound index for efficient lookups
AnalysisCacheSchema.index({ username: 1, isPremium: 1 });

// TTL index - MongoDB will automatically delete expired documents
AnalysisCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

addSchemaPlugins(AnalysisCacheSchema);

// @ts-expect-error type casting mismatch from mongoose
export const AnalysisCache: Model<IAnalysisCache> = model<IAnalysisCache>(
  'AnalysisCache',
  AnalysisCacheSchema,
);
