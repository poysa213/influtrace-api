import { Router } from 'express';

import { profileLinkingFeedbackHandler, appFeedbackHandler, appFeedbackTextHandler } from '~/controllers/feedback';
import { ensureUserIsAuthenticated } from '~/middlewares/auth';

const router = Router();

router.post(
  '/instagram-connection',
  ensureUserIsAuthenticated,
  profileLinkingFeedbackHandler,
);

router.post(
  '/app',
  ensureUserIsAuthenticated,
  appFeedbackHandler,
);

router.post(
  '/app-text',
  ensureUserIsAuthenticated,
  appFeedbackTextHandler,
);

export default router;
