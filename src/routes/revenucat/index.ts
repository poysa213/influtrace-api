import { Router } from 'express';
import webhookRouter from './webhook';

const router = Router();

router.use('/webhook', webhookRouter);

export default router; 