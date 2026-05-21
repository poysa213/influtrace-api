import mongoose, { ConnectOptions } from 'mongoose';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

type DbOptions = {
  logSuccess: boolean;
  logError: boolean;
};

const connect = async (
  options?: Partial<DbOptions>,
  mongooseOptions?: ConnectOptions,
) => {
  try {
    const URI = env.DATABASE_URL;
    if (!URI) throw new Error('MongoDB uri not found');

    await mongoose.connect(URI, mongooseOptions);
    if (options?.logSuccess)
      logger.info(
        `Connected to database: ${mongoose?.connection?.db?.databaseName}`,
      );
  } catch (error) {
    if (options?.logError) logger.error(error);
    logger.error(error);
    throw error;
  }
};

const disconnect = async (options?: Partial<DbOptions>) => {
  try {
    await mongoose.disconnect();
    if (options?.logSuccess)
      logger.info(
        `Disconnected from database: ${mongoose?.connection?.db?.databaseName}`,
      );
  } catch (error) {
    if (options?.logError) logger.error(error);
    throw error;
  }
};

const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

export const db = {
  connect,
  disconnect,
  isConnected,
};
