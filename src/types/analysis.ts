export type Metric = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  description?: string;
};

export type InstagramProfile = {
  username: string;
  full_name: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  is_verified: boolean;
  is_private: boolean;
  biography?: string;
  external_url?: string;
};

export type AnalysisResult = {
  id: string;
  username: string;
  analyzedAt: string;
  overallScore: number;
  metrics: Metric[];
  summary: string;
  profile: InstagramProfile;
  recommendations?: string[];
  performance?: {
    views_per_follower: number;
    likes_per_follower: number;
    comments_per_follower: number;
    reach_percentage: number;
    reach_score: string;
    engagement_score: string;
    content_value_score: string;
    save_rate: number;
    share_rate: number;
    comment_depth: number;
  };
  expiresAt?: string;
  fromCache?: boolean;
  performanceReportNotificationsEnabled?: boolean;
};
