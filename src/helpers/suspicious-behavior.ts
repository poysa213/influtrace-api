import { GenderEnum } from '~/types';
import { isWeekend } from 'date-fns';

export interface UserWithGender {
  username: string;
  gender: GenderEnum;
}

/**
 * Determines if a given time is during late-night hours (10 PM - 6 AM)
 */
export const isLateNightTime = (date: Date): boolean => {
  const hour = date.getHours();
  return hour >= 22 || hour <= 6;
};

/**
 * Determines if a given time is during weekend
 */
export const isWeekendTime = (date: Date): boolean => {
  return isWeekend(date);
};

/**
 * Gets the severity level based on temporal context
 * @param date - The date to analyze
 * @returns Severity level: 'high' for late-night, 'medium' for weekend, 'low' for weekday
 */
export const getTemporalSeverity = (date: Date): 'high' | 'medium' | 'low' => {
  if (isLateNightTime(date)) {
    return 'high';
  }
  if (isWeekendTime(date)) {
    return 'medium';
  }
  return 'low';
};

/**
 * Gets the time context based on temporal analysis
 * @param date - The date to analyze
 * @returns Time context: 'night' for late-night, 'weekend' for weekend, 'day' for weekday
 */
export const getTimeContext = (date: Date): 'night' | 'weekend' | 'day' => {
  if (isLateNightTime(date)) {
    return 'night';
  }
  if (isWeekendTime(date)) {
    return 'weekend';
  }
  return 'day';
};
