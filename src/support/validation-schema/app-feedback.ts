import { boolean, object } from 'yup';

export const appFeedbackSchema = object().shape({
  liked: boolean().required('Liked field is required'),
});