import { Router } from 'express';

import {
  sendSelfNotificationkHandler,
  updatePerformanceNotificationHandler,
} from '~/controllers/notification';
import {
  ensureUserIsAuthenticated,
  ensureUserIsInternal,
} from '~/middlewares/auth';

const router = Router();

router.post(
  '/self',
  ensureUserIsInternal,
  sendSelfNotificationkHandler,
);

router.patch(
  '/performance-reports',
  ensureUserIsAuthenticated,
  updatePerformanceNotificationHandler,
);

export default router;
