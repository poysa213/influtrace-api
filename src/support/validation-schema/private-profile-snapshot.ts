import { array, boolean, object, string } from 'yup';

export const privateProfileSnapshotSchema = object().shape({
  followers: array().of(
    object().shape({
      pk: string(),
      id: string().required(),
      username: string().required(),
      full_name: string().optional(),
      biography: string().optional(),
      profile_pic_url: string().required(),
      is_private: boolean().required(),
      is_verified: boolean().required(),
    }),
  ),

  followings: array().of(
    object().shape({
      pk: string(),
      id: string().required(),
      username: string().required(),
      full_name: string().optional(),
      biography: string().optional(),
      profile_pic_url: string().required(),
      is_private: boolean().required(),
      is_verified: boolean().required(),
    }),
  ),
});
