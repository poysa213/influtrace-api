import { object, string } from 'yup';

export const pushTokenSchema = object().shape({
  token: string().required('Push token is required'),
});
