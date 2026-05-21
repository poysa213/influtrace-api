import { object, string } from 'yup';

export const instagramUsernameRegex = /^[\w](?!.*?\.{2})[\w.]{1,28}[\w]$/;

export const trackUserSchema = object().shape({
  username: string()
    .required('Username is required')
    .matches(
      instagramUsernameRegex,
      'The provided username contains invalid characters or is malformed',
    ),
});
