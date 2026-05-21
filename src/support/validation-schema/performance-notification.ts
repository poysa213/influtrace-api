import { boolean, object, string } from 'yup';

export const updatePerformanceNotificationSchema = object().shape({
  enabled: boolean().required('enabled field is required'),
  subscriptionId: string().optional().min(1, 'subscriptionId cannot be empty'),
  username: string()
    .optional()
    .max(100, 'Username must be at most 100 characters long'),
  source: string()
    .optional()
    .max(100, 'Source must be at most 100 characters long'),
});
