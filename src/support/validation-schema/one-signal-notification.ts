import { object, string } from 'yup';

export const oneSignalNotificationSchema = object().shape({
  title: string()
    .required('Title is required')
    .max(100, 'Title must be at most 100 characters long'),
  profilePictureUrl: string()
    .url('Profile picture URL must be a valid URL')
    .optional(),
  body: string()
    .required('Body is required')
    .max(500, 'Body must be at most 500 characters long'),
});
