import { object, string } from 'yup';

export const profileLinkingFeedbackSchema = object().shape({
  feedback: string()
    .required('Feedback is required')
    .max(1000, 'Feedback must be at most 1000 characters long'),
});
