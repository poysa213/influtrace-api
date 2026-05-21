import { array, boolean, object, string } from 'yup';

import { instagramUsernameRegex } from './instagram';

export const recentFollowsSchema = object()
  .shape({
    username: string()
      .required('Username is required')
      .matches(
        instagramUsernameRegex,
        'The provided username contains invalid characters or is malformed',
      ),
    recent_follows: array().of(
      object()
        .shape({
          username: string()
            .required()
            .matches(
              instagramUsernameRegex,
              'The provided username contains invalid characters or is malformed',
            ),
          is_business: boolean().optional(),
          profile_pic_url: string().optional(),
        })
        .noUnknown(true, 'Unknown field in recent_follows object')
        .strict(true),
    ),
    recent_followers: array().of(
      object()
        .shape({
          username: string()
            .required()
            .matches(
              instagramUsernameRegex,
              'The provided username contains invalid characters or is malformed',
            ),
          is_business: boolean().optional(),
          profile_pic_url: string().optional(),
        })
        .noUnknown(true, 'Unknown field in recent_followers object')
        .strict(true),
    ).optional(),
  })
  .noUnknown(true, 'Unknown field in body object');
