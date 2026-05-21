import { Router } from 'express';

import { pingNotification } from '~/controllers/test';
import { ensureUserIsAuthenticated } from '~/middlewares/auth';

const router = Router();

router.post(
  '/ping-notification',
  ensureUserIsAuthenticated,
  pingNotification,
);

export default router;
