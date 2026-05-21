import { object, string } from 'yup';

export const initSchema = object().shape({
  uid: string().required(),
  pushNotificationToken: string().nullable().notRequired(),
});
