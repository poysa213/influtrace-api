import { Router } from 'express';

import { env } from '~/utils/env';

import analyzeRoutes from './analyze';
import feedbackRoutes from './feedback';
import notificationRoutes from './notification';
import subscriptionRoutes from './subscription';
import testRoutes from './test';
import trackRoutes from './track';
import userRoutes from './user';

const router = Router();

router.use('/users', userRoutes);

router.use('/analyses', analyzeRoutes);

router.use('/track', trackRoutes);

router.use('/feedback', feedbackRoutes);

router.use('/notifications', notificationRoutes);

router.use('/subscription', subscriptionRoutes);

if (env.NODE_ENV === 'development') {
  router.use('/test', testRoutes);
}

export default router;
