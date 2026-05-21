import mongoose, { Document, Schema } from 'mongoose';

export interface IAppConf extends Document {
  allowPrivateProfiles: boolean;
  enableProfilePictureEvaluation: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AppConfSchema = new Schema<IAppConf>(
  {
    allowPrivateProfiles: {
      type: Boolean,
      default: false,
    },
    enableProfilePictureEvaluation: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Ensure only one configuration document exists
AppConfSchema.index({}, { unique: true });

export const AppConf = mongoose.model<IAppConf>('AppConf', AppConfSchema);

// Helper function to get app configuration
export const getAppConfig = async (): Promise<IAppConf> => {
  let config = await AppConf.findOne();

  if (!config) {
    config = await AppConf.create({
      allowPrivateProfiles: false,
      enableProfilePictureEvaluation: true,
    });
  }

  return config;
};
