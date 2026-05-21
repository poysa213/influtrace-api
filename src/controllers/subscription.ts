import { Request, Response } from 'express';
import { createExceptionErrorResponse } from '~/utils/error';
import { User } from '~/models/user';

export const getSubscriptionStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const deviceId = req.headers['x-device-id'] as string;
  
      if (!deviceId) {
        res.status(400).json({ error: 'Device ID is required' });
        return;
      }
  
      const user = await User.findOne({ deviceId });
      
      if (!user) {
        res.json({
          hasSubscription: false,
          hasFreeSubscription: false,
          subscription: null,
        });
        return;
      }
  
      const hasActiveSubscription = user.subscription?.isActive || false;
      const hasFreeSubscription = user.hasFreeSubscription || false;
      
      res.json({
        hasSubscription: hasActiveSubscription,
        hasFreeSubscription,
        subscription: user.subscription || null,
        isPro: hasActiveSubscription || hasFreeSubscription,
      });
    } catch (error) {
      console.error('Get subscription status error:', error);
      createExceptionErrorResponse(res, error);
    }
  };
  
  export const deleteSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const deviceId = req.headers['x-device-id'] as string;
  
      if (!deviceId) {
        res.status(400).json({ error: 'Device ID is required' });
        return;
      }
  
      const user = await User.findOne({ deviceId });
      
      if (user) {
        user.subscription = undefined;
        user.hasFreeSubscription = false;
        await user.save();
        if (process.env.NODE_ENV === 'development') {
          console.log('🗑️ Subscription deleted for device:', deviceId);
        }
      }
  
      res.json({
        success: true,
        message: 'Subscription deleted successfully',
      });
    } catch (error) {
      console.error('Delete subscription error:', error);
      createExceptionErrorResponse(res, error);
    }
  };