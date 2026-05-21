import { number, object, string } from 'yup';

import { instagramUsernameRegex } from './instagram';

export const PrivateProfilesLogsSchema = object().shape({
  // make event an enum init | success | session_invalid | error
  event: string()
    .oneOf(['init', 'success', 'session_invalid', 'error'])
    .required('Event is required'),
  user: object()
    .optional()
    .shape({
      username: string().matches(
        instagramUsernameRegex,
        'The provided username contains invalid characters or is malformed',
      ),
      profile_pic_url: string(),
      follower_count: number(),
      following_count: number(),
    }),
  details: object().optional(),
});
