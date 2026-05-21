import { Router } from 'express';

import { analyzeByUsername } from '~/controllers/analyze';
import { ensureUserIsAuthenticated } from '~/middlewares/auth';

const router = Router();

router.post(
  '/',
  ensureUserIsAuthenticated,
  analyzeByUsername,
);

export default router;
