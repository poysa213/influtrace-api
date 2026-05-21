export type EventTypes = 'follow' | 'unfollow' | 'followBy' | 'unfollowBy';

export enum EVENT_TYPES {
  Follow = 'follow',
  Unfollow = 'unfollow',
  FollowBy = 'followBy',
  UnfollowBy = 'unfollowBy',
}

export type Gender = 'male' | 'female' | 'other' | 'not-detected';

export enum GenderEnum {
  Male = 'male',
  Female = 'female',
  Other = 'other',
  NotDetected = 'not-detected',
}
