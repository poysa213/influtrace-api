import { Router } from 'express';
import { getSubscriptionStatus, deleteSubscription } from '~/controllers/subscription';

const router = Router();

// Get user subscription status
router.get('/status', getSubscriptionStatus);

// Delete subscription (debug only)
if (process.env.NODE_ENV === 'development') {
  router.delete('/delete', deleteSubscription);
}

export default router;