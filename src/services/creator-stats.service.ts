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
  avg_likes: number;
  avg_comments: number;
  avg_saves: number;
  avg_shares: number;
  save_rate: number;
  share_rate: number;
  comment_depth: number;
  posts_analyzed: number;
  virality_factor: number;
  reels_count: number;
  carousels_count: number;
  photos_count: number;
  best_type: string;
}

function mean(nums: number[]) {
  if (!nums || nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function getMediaType(post: MediaPost): 'reel' | 'carousel' | 'photo' {
  const productType = (post.product_type || '') as string;
  if (productType === 'clips') return 'reel';
  const mediaType = Number(post.media_type ?? 0);
  if (mediaType === 1) return 'photo';
  if (mediaType === 8) return 'carousel';
  return 'reel';
}

function extract(post: MediaPost) {
  const likes = Number(post.like_count || 0) || 0;
  const comments = Number(post.comment_count || 0) || 0;
  const saves = Number(post.save_count || 0) || 0;
  const shares = Number(post.reshare_count || 0) || 0;
  let views = Number(post.play_count ?? post.view_count ?? 0) || 0;

  if (views === 0) {
    const mediaType = Number(post.media_type ?? 0);
    if (mediaType === 1) {
      views = likes > 0 ? likes : 1;
    }
  }

  return { likes, comments, saves, shares, views: views > 0 ? views : 1 };
}

class CreatorStatsService {
  private calculateReachScore(avgViews: number, followers: number): string {
    if (followers === 0) return 'N/A';
    const pct = (avgViews / followers) * 100;
    if (pct >= 20) return 'Excellent';
    if (pct >= 10) return 'Good';
    if (pct >= 5) return 'Average';
    return 'Below Average';
  }

  private calculateEngagementScore(rate: number): string {
    if (rate >= 5) return 'Excellent';
    if (rate >= 3) return 'Good';
    if (rate >= 1.5) return 'Average';
    return 'Below Average';
  }

  private calculateValueScore(saveRate: number): string {
    if (saveRate >= 5) return 'Excellent';
    if (saveRate >= 2) return 'Good';
    if (saveRate >= 0.5) return 'Average';
    return 'Below Average';
  }

  calculateStatistics(
    posts: MediaPost[],
    followerCount = 0,
  ): CreatorStatistics {
    if (!posts || posts.length === 0) {
      return {
        error: 'No posts found',
        engagement_rate: 0,
        avg_views: 0,
        avg_likes: 0,
        avg_comments: 0,
        avg_saves: 0,
        avg_shares: 0,
        save_rate: 0,
        share_rate: 0,
        comment_depth: 0,
        posts_analyzed: 0,
        virality_factor: 0,
        reels_count: 0,
        carousels_count: 0,
        photos_count: 0,
        best_type: '',
      };
    }

    const likesArr: number[] = [];
    const commentsArr: number[] = [];
    const savesArr: number[] = [];
    const sharesArr: number[] = [];
    const viewsArr: number[] = [];

    const typeBuckets: Record<string, { likes: number[]; comments: number[]; saves: number[]; shares: number[]; views: number[] }> = {
      reel: { likes: [], comments: [], saves: [], shares: [], views: [] },
      carousel: { likes: [], comments: [], saves: [], shares: [], views: [] },
      photo: { likes: [], comments: [], saves: [], shares: [], views: [] },
    };

    for (const p of posts) {
      const m = extract(p);
      if (m.likes === 0 && m.comments === 0 && m.views <= 1) continue;

      likesArr.push(m.likes);
      commentsArr.push(m.comments);
      savesArr.push(m.saves);
      sharesArr.push(m.shares);
      viewsArr.push(m.views);

      const type = getMediaType(p);
      typeBuckets[type].likes.push(m.likes);
      typeBuckets[type].comments.push(m.comments);
      typeBuckets[type].saves.push(m.saves);
      typeBuckets[type].shares.push(m.shares);
      typeBuckets[type].views.push(m.views);
    }

    if (!viewsArr.length) {
      return {
        error: 'No valid posts found',
        engagement_rate: 0,
        avg_views: 0,
        avg_likes: 0,
        avg_comments: 0,
        avg_saves: 0,
        avg_shares: 0,
        save_rate: 0,
        share_rate: 0,
        comment_depth: 0,
        posts_analyzed: 0,
        virality_factor: 0,
        reels_count: 0,
        carousels_count: 0,
        photos_count: 0,
        best_type: '',
      };
    }

    const totalViews = viewsArr.reduce((a, b) => a + b, 0);
    const totalLikes = likesArr.reduce((a, b) => a + b, 0);
    const totalComments = commentsArr.reduce((a, b) => a + b, 0);
    const totalSaves = savesArr.reduce((a, b) => a + b, 0);
    const totalShares = sharesArr.reduce((a, b) => a + b, 0);

    const avgEngagements = (totalLikes + totalComments) / viewsArr.length;
    const engagementRate =
      followerCount > 0
        ? (avgEngagements / followerCount) * 100
        : totalViews > 0
          ? ((totalLikes + totalComments) / totalViews) * 100
          : 0;

    const saveRate = totalViews > 0 ? (totalSaves / totalViews) * 100 : 0;
    const shareRate = totalViews > 0 ? (totalShares / totalViews) * 100 : 0;
    const commentDepth = mean(viewsArr) > 0
      ? (mean(commentsArr) / mean(viewsArr)) * 1000
      : 0;

    const sortedViews = [...viewsArr].sort((a, b) => a - b);
    const medianViews =
      sortedViews.length % 2 === 0
        ? (sortedViews[sortedViews.length / 2 - 1] +
            sortedViews[sortedViews.length / 2]) / 2
        : sortedViews[Math.floor(sortedViews.length / 2)];
    const viralityFactor = medianViews > 0 ? Math.max(...viewsArr) / medianViews : 0;

    const reelsCount = typeBuckets.reel.views.length;
    const carouselsCount = typeBuckets.carousel.views.length;
    const photosCount = typeBuckets.photo.views.length;

    let bestType = '';
    const typePerformance: Record<string, number> = {};
    for (const [typeName, bucket] of Object.entries(typeBuckets)) {
      const avg = mean(bucket.views);
      if (avg > 0) typePerformance[typeName] = avg;
    }
    if (Object.keys(typePerformance).length > 0) {
      bestType = Object.entries(typePerformance).sort(([, a], [, b]) => b - a)[0][0];
    }

    return {
      engagement_rate: engagementRate,
      avg_views: mean(viewsArr),
      avg_likes: mean(likesArr),
      avg_comments: mean(commentsArr),
      avg_saves: mean(savesArr),
      avg_shares: mean(sharesArr),
      save_rate: saveRate,
      share_rate: shareRate,
      comment_depth: commentDepth,
      posts_analyzed: viewsArr.length,
      virality_factor: viralityFactor,
      reels_count: reelsCount,
      carousels_count: carouselsCount,
      photos_count: photosCount,
      best_type: bestType,
    };
  }

  async analyzeByUsername(
    username: string,
    opts?: { limit?: number },
  ) {
    const limit = opts?.limit ?? 24;
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

      const userId = String(profile.pk || '');
      const posts = await hikerService.getUserMediasGql(userId, limit);
      const followerCount = profile.follower_count || 0;

      const statsAll = this.calculateStatistics(posts, followerCount);

      const reelsPosts = posts.filter((p: MediaPost) => getMediaType(p) === 'reel');
      const statsReels = this.calculateStatistics(reelsPosts, followerCount);
      const statsForPerformance = statsAll;

      const performanceMetrics = {
        views_per_follower: followerCount > 0 ? statsForPerformance.avg_views / followerCount : 0,
        likes_per_follower: followerCount > 0 ? statsForPerformance.avg_likes / followerCount : 0,
        comments_per_follower: followerCount > 0 ? statsForPerformance.avg_comments / followerCount : 0,
        reach_percentage: followerCount > 0 ? (statsForPerformance.avg_views / followerCount) * 100 : 0,
        reach_score: this.calculateReachScore(statsForPerformance.avg_views, followerCount),
        engagement_score: this.calculateEngagementScore(statsForPerformance.engagement_rate),
        content_value_score: this.calculateValueScore(statsForPerformance.save_rate),
        save_rate: statsForPerformance.save_rate,
        share_rate: statsForPerformance.share_rate,
        comment_depth: statsForPerformance.comment_depth,
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
