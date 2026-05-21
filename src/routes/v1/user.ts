import { Router } from 'express';

import { getUser, init, markOneSignalIntegrated } from '~/controllers/user';
import { ensureUserIsAuthenticated } from '~/middlewares/auth';

const router = Router();

router.post('/init', init);
router.get('/me', getUser);
router.post(
  '/onesignal-integrated',
  ensureUserIsAuthenticated,
  markOneSignalIntegrated,
);

export default router;
