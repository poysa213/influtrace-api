import app from '~/server';

import { db } from '~/utils/db';
import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) =>
  process.on(signal, async () => {
    try {
      await db.disconnect();
      logger.info('Disconnected from database.');
      process.exit(0);
    } catch (error) {
      await db.disconnect();
      logger.error(error);
      process.exit(1);
    }
  }),
);

(async () => {
  await db.connect({
    logSuccess: true,
    logError: true,
  });

  app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`${env.APP_NAME} is running on ${env.APP_URL}`);
  });
})();
