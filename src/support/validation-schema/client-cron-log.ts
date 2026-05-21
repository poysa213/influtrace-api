import { boolean, object, string } from 'yup';

export const clientCronLogSchema = object().shape({
  timestamp: string().optional(),
  message: string().optional(),
  success: boolean().optional(),
  details: object().optional(),
});
