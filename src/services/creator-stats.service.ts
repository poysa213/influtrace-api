import { logger } from '~/utils/logger';

import { hikerService, UserProfile } from './hiker.service';

type MediaPost = Record<string, any>;

export interface CreatorProfile {
  id: string;
  username: string;
  full_name: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  profile_pic_url: string;
  is_verified: boolean;
  is_private: boolean;
  biography: string;
  external_url: string;
}

export interface CreatorStatistics {
  error?: string;
  engagement_rate: number;
  avg_views: number;
  avg_comments: number;
  avg_likes: number;
  posts_analyzed: number;
  posts_per_day: number;
  virality_factor: number;
}

function mean(nums: number[]) {
  if (!nums || nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

class CreatorStatsService {
  private extractMetrics(
    post: MediaPost,
  ): null | { likes: number; comments: number; views: number } {
    const likes = Number(post.like_count || post.likes || 0) || 0;
    const comments = Number(post.comment_count || post.comments || 0) || 0;
    let views = Number(post.play_count ?? post.view_count ?? 0) || 0;

    if (views <= 0) return null;

    return { likes, comments, views };
  }

  private extractMetricsWithPhotos(
    post: MediaPost,
  ): null | { likes: number; comments: number; views: number } {
    const likes = Number(post.like_count || post.likes || 0) || 0;
    const comments = Number(post.comment_count || post.comments || 0) || 0;
    let views = Number(post.play_count ?? post.view_count ?? 0) || 0;

    if (views === 0) {
      const media_type = post.media_type ?? post.mediaType ?? null;
      // media_type === 1 -> photo
      if (media_type === 1) {
        views = likes > 0 ? likes : 1;
      }
    }

    if (likes === 0 && comments === 0) return null;

    return { likes, comments, views: views > 0 ? views : 1 };
  }

  private isReel(post: MediaPost) {
    const productType = (post.product_type || post.productType || '') as string;
    if (
      typeof productType === 'string' &&
      ['clips', 'reel'].includes(productType.toLowerCase())
    )
      return true;
    const mediaType = post.media_type ?? post.mediaType;
    if (mediaType === 2) return true;
    if (post.clips_metadata) return true;
    return false;
  }

  private calculateReachScore(avgViews: number, followers: number): string {
    if (followers === 0) return 'N/A';
    const reachPct = (avgViews / followers) * 100;

    if (reachPct >= 20) return 'Excellent';
    if (reachPct >= 10) return 'Good';
    if (reachPct >= 5) return 'Average';
    return 'Below Average';
  }

  private calculateEngagementScore(engagementRate: number): string {
    if (engagementRate >= 5) return 'Excellent';
    if (engagementRate >= 3) return 'Good';
    if (engagementRate >= 1.5) return 'Average';
    return 'Below Average';
  }

  calculateStatistics(
    posts: MediaPost[],
    opts?: {
      reelsOnly?: boolean;
      includePhotos?: boolean;
      followerCount?: number;
    },
  ): CreatorStatistics {
    const reelsOnly = Boolean(opts?.reelsOnly);
    const includePhotos = Boolean(opts?.includePhotos);
    const followerCount = opts?.followerCount || 0;

    if (!posts || posts.length === 0) {
      return {
        error: 'No posts found',
        engagement_rate: 0,
        avg_views: 0,
        avg_comments: 0,
        avg_likes: 0,
        posts_analyzed: 0,
        posts_per_day: 0,
        virality_factor: 0,
      };
    }

    if (reelsOnly) {
      posts = posts.filter((p) => this.isReel(p));
      if (!posts.length) {
        return {
          error: 'No reels found',
          engagement_rate: 0,
          avg_views: 0,
          avg_comments: 0,
          avg_likes: 0,
          posts_analyzed: 0,
          posts_per_day: 0,
          virality_factor: 0,
        };
      }
    }

    const likesArr: number[] = [];
    const commentsArr: number[] = [];
    const viewsArr: number[] = [];
    const timestamps: number[] = [];

    const extractor = includePhotos
      ? this.extractMetricsWithPhotos.bind(this)
      : this.extractMetrics.bind(this);

    for (const p of posts) {
      const m = extractor(p as MediaPost);
      if (!m) continue;
      likesArr.push(m.likes);
      commentsArr.push(m.comments);
      viewsArr.push(m.views);

      const timestamp = p.taken_at || p.takenAt;
      if (timestamp) timestamps.push(Number(timestamp));
    }

    if (!viewsArr.length) {
      return {
        error: 'No valid posts with view counts found',
        engagement_rate: 0,
        avg_views: 0,
        avg_comments: 0,
        avg_likes: 0,
        posts_analyzed: 0,
        posts_per_day: 0,
        virality_factor: 0,
      };
    }

    const totalEngagements =
      likesArr.reduce((a, b) => a + b, 0) +
      commentsArr.reduce((a, b) => a + b, 0);
    const totalViews = viewsArr.reduce((a, b) => a + b, 0);

    // Calculate engagement rate: (average likes + average comments) / followers * 100
    // Falls back to engagement per view if follower count not available
    const avgEngagements = totalEngagements / viewsArr.length;
    const engagementRate =
      followerCount > 0
        ? (avgEngagements / followerCount) * 100
        : totalViews > 0
          ? (totalEngagements / totalViews) * 100
          : 0;

    let postsPerDay = 0;
    if (timestamps.length >= 2) {
      const sorted = timestamps.sort((a, b) => a - b);
      const daysDiff = (sorted[sorted.length - 1] - sorted[0]) / (60 * 60 * 24);
      // Ensure we have at least 1 day difference to calculate meaningful posts per day
      postsPerDay = daysDiff >= 1 ? timestamps.length / daysDiff : 0;
    } else if (timestamps.length === 1) {
      // Single post - can't calculate posting frequency
      postsPerDay = 0;
    }

    // Calculate proper median (average of middle two values for even-length arrays)
    const sortedViews = [...viewsArr].sort((a, b) => a - b);
    const medianViews =
      sortedViews.length % 2 === 0
        ? (sortedViews[sortedViews.length / 2 - 1] +
            sortedViews[sortedViews.length / 2]) /
          2
        : sortedViews[Math.floor(sortedViews.length / 2)];

    const maxViews = Math.max(...viewsArr);
    const viralityFactor = medianViews > 0 ? maxViews / medianViews : 0;

    return {
      engagement_rate: engagementRate,
      avg_views: mean(viewsArr),
      avg_comments: mean(commentsArr),
      avg_likes: mean(likesArr),
      posts_analyzed: viewsArr.length,
      posts_per_day: postsPerDay,
      virality_factor: viralityFactor,
    };
  }

  async analyzeByUsername(
    username: string,
    opts?: { limit?: number; includePhotos?: boolean },
  ) {
    const limit = opts?.limit ?? 20;
    try {
      const profile = await hikerService.getUserProfileByUsername(username);
      if (!profile) {
        return { error: 'profile_not_found' };
      }

      if (profile.is_private) {
        const err: any = new Error('Not authorized to view user');
        err.status = 403;
        err.data = {
          detail: 'Not authorized to view user',
          exc_type: 'PrivateAccount',
        };
        throw err;
      }

      const userProfile = profile;
      const userId = String(userProfile.pk || '');

      const posts = await hikerService.getUserMediasChunk(userId, limit);

      const followerCount = profile.follower_count || 0;

      const statsAll = this.calculateStatistics(posts, {
        reelsOnly: false,
        includePhotos: !!opts?.includePhotos,
        followerCount: followerCount,
      });

      let statsReels = this.calculateStatistics(posts, {
        reelsOnly: true,
        includePhotos: false,
        followerCount: followerCount,
      });

      if (statsReels.posts_analyzed === 0) {
        const clips = await hikerService.getUserClipsChunk(userId, limit);
        if (clips && clips.length) {
          statsReels = this.calculateStatistics(clips, {
            reelsOnly: false,
            includePhotos: false,
            followerCount: followerCount,
          });
        }
      }

      // Use reels stats for performance metrics if available, otherwise use all stats
      const statsForPerformance =
        statsReels.posts_analyzed > 0 ? statsReels : statsAll;

      const performanceMetrics = {
        views_per_follower:
          followerCount > 0 ? statsForPerformance.avg_views / followerCount : 0,
        likes_per_follower:
          followerCount > 0 ? statsForPerformance.avg_likes / followerCount : 0,
        comments_per_follower:
          followerCount > 0
            ? statsForPerformance.avg_comments / followerCount
            : 0,
        reach_percentage:
          followerCount > 0
            ? (statsForPerformance.avg_views / followerCount) * 100
            : 0,
        reach_score: this.calculateReachScore(
          statsForPerformance.avg_views,
          followerCount,
        ),
        engagement_score: this.calculateEngagementScore(
          statsForPerformance.engagement_rate,
        ),
      };

      return {
        profile: {
          id: userId,
          username: profile.username,
          full_name: profile.full_name,
          follower_count: profile.follower_count,
          following_count: profile.following_count,
          media_count: profile.media_count,
          profile_pic_url: profile.profile_pic_url,
          is_verified: profile.is_verified,
          is_private: profile.is_private,
          biography: profile.biography,
          external_url: profile.external_url,
        },
        all: statsAll,
        reels: statsReels,
        performance: performanceMetrics,
      };
    } catch (error) {
      logger.error('creator-stats: analyzeByUsername failed', error);
      throw error;
    }
  }
}

export const creatorStatsService = new CreatorStatsService();
