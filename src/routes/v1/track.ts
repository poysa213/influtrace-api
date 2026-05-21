import { Router } from 'express';

import { postEventTracking } from '~/controllers/track';
import { ensureUserIsAuthenticated } from '~/middlewares/auth';

const router = Router();

router.post(
  '/:event',
  ensureUserIsAuthenticated,
  postEventTracking,
);

export default router;
