import { StatusCodes } from 'http-status-codes';

import { AnalysisCache } from '~/models/analysis_cache';
import { PerformanceNotificationPreference } from '~/models/performance_notification_preference';

import { AppError, ErrorCodes } from '~/utils/error';
import { logger } from '~/utils/logger';

import {
  CreatorProfile,
  CreatorStatistics,
  creatorStatsService,
} from './creator-stats.service';
import { openaiApiService } from './openai-api.service';

import { AnalysisResult } from '~/types/analysis';

export class AnalyzeService {
  private readonly LITE_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
  private readonly PREMIUM_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
  private readonly FAILURE_CACHE_TTL_MS = 1000 * 60 * 2; // 2 minutes

  private async getFromCache(
    username: string,
    isPremium: boolean,
  ): Promise<AnalysisResult | null> {
    try {
      const cached = await AnalysisCache.findOne({
        username: username.toLowerCase(),
        isPremium,
        expiresAt: { $gt: new Date() },
      }).lean();

      if (cached) {
        logger.debug(
          `[AnalyzeService] Cache hit for ${username} (premium: ${isPremium})`,
        );
        return { ...cached.result, fromCache: true };
      }

      logger.debug(
        `[AnalyzeService] Cache miss for ${username} (premium: ${isPremium})`,
      );
      return null;
    } catch (error) {
      logger.error('[AnalyzeService] Failed to read from cache', error);
      return null;
    }
  }

  private async setCache(
    username: string,
    isPremium: boolean,
    result: AnalysisResult,
    ttlMs?: number,
  ): Promise<void> {
    try {
      const ttl = ttlMs ?? this.LITE_CACHE_TTL_MS;
      const expiresAt = new Date(Date.now() + ttl);

      // upsert
      await AnalysisCache.findOneAndUpdate(
        {
          username: username.toLowerCase(),
          isPremium,
        },
        {
          username: username.toLowerCase(),
          isPremium,
          result,
          createdAt: new Date(),
          expiresAt,
        },
        {
          upsert: true,
          new: true,
        },
      );

      logger.debug(
        `[AnalyzeService] Cached result for ${username} (premium: ${isPremium}, TTL: ${ttl}ms)`,
      );
    } catch (error) {
      logger.error('[AnalyzeService] Failed to save to cache', error);
    }
  }

  private computeOverallScore(engagementRate: number, avgViews: number) {
    const engagementScore = Math.min(
      100,
      Math.round((engagementRate / 10) * 100),
    );
    const viewScore = Math.min(
      100,
      Math.round(Math.log10(Math.max(1, avgViews)) * 20),
    );
    return Math.round(engagementScore * 0.7 + viewScore * 0.3);
  }

  private async getPerformanceReportNotificationStatus(
    username: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const preference = await PerformanceNotificationPreference.findOne({
        userId,
        username: username.toLowerCase(),
      }).lean();

      if (!preference) {
        return false;
      }

      return preference.status === 'enabled';
    } catch (error) {
      logger.error(
        '[AnalyzeService] Failed to get notification preference',
        error,
      );
      return false;
    }
  }

  private async generateAIRecommendations(
    stats: CreatorStatistics,
    profile: CreatorProfile,
  ): Promise<string[]> {
    try {
      const prompt = `You are an Instagram growth expert. Based on the following account metrics, generate exactly 3 specific, actionable recommendations to improve their account performance.

Account Stats:
- Posts analyzed: ${stats.posts_analyzed || 0}
- Engagement rate: ${Number(stats.engagement_rate || 0).toFixed(2)}%
- Average views: ${Math.round(Number(stats.avg_views || 0))}
- Average likes: ${Math.round(Number(stats.avg_likes || 0))}
- Average comments: ${Math.round(Number(stats.avg_comments || 0))}
- Posts per day: ${Number(stats.posts_per_day || 0).toFixed(1)}
- Followers: ${profile.follower_count || 0}
- Following: ${profile.following_count || 0}

Format your response as a JSON object with a "recommendations" array containing exactly 3 strings.

Example format:
{
  "recommendations": [
    "Post more consistently, you have been posting only 3x contents last week",
    "Focus on engagement, your engagement rate is below 2%",
    "Try using trending audio in your reels to boost visibility"
  ]
}

Keep recommendations specific, data-driven, and actionable. Use the actual numbers from the stats.`;

      const response = await openaiApiService.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      const recommendations = parsed.recommendations || [];

      return Array.isArray(recommendations) ? recommendations.slice(0, 3) : [];
    } catch (error) {
      logger.error('[AnalyzeService] AI recommendations failed', error);
      return [];
    }
  }

  public async analyzeLite(
    username: string,
    userId: string,
  ): Promise<AnalysisResult> {
    const cached = await this.getFromCache(username, false);
    if (cached) return cached;

    try {
      const data = await creatorStatsService.analyzeByUsername(username, {
        limit: 20,
        includePhotos: true,
      });
      if (!data || 'error' in data || !data.profile) {
        throw new AppError({
          message: 'Failed to fetch profile data',
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.SERVICE_UNAVAILABLE,
        });
      }

      const profile = data.profile;
      const allStats = data.all;
      const reelsStats = data.reels;

      const statsForDisplay =
        reelsStats.posts_analyzed > 0 ? reelsStats : allStats;

      const engagementRate = Number(statsForDisplay.engagement_rate || 0);
      const avgViews = Number(statsForDisplay.avg_views || 0);
      const avgComments = Number(statsForDisplay.avg_comments || 0);

      const overallScore = this.computeOverallScore(engagementRate, avgViews);

      const metrics = [
        {
          key: 'engagement_rate',
          label: 'Engagement rate',
          value: `${Math.round(engagementRate * 10) / 10}`,
          unit: '%',
        },
        {
          key: 'avg_views',
          label: 'Average reel views',
          value: Math.round(avgViews),
        },
        {
          key: 'avg_comments',
          label: 'Average comments',
          value: Math.round(avgComments),
        },
      ];

      const now = new Date().toISOString();

      const performanceReportNotificationsEnabled =
        await this.getPerformanceReportNotificationStatus(username, userId);

      const result: AnalysisResult = {
        id: `analysis-${Date.now()}`,
        username,
        analyzedAt: now,
        overallScore,
        metrics,
        summary: `Analyzed ${allStats.posts_analyzed || 0} posts.`,
        profile: {
          username: String(profile.username || username),
          full_name: String(profile.full_name || ''),
          profile_pic_url: String(profile.profile_pic_url || ''),
          follower_count: Number(profile.follower_count || 0),
          following_count: Number(profile.following_count || 0),
          media_count: Number(profile.media_count || 0),
          is_verified: Boolean(profile.is_verified),
          is_private: Boolean(profile.is_private),
          biography: profile.biography ? String(profile.biography) : undefined,
          external_url: profile.external_url
            ? String(profile.external_url)
            : undefined,
        },
        performanceReportNotificationsEnabled,
        fromCache: false,
      };

      await this.setCache(username, false, result, this.LITE_CACHE_TTL_MS);
      return result;
    } catch (error: any) {
      logger.error('analyzeLite failed', error);
      if (error?.status === 403 && error?.data?.exc_type === 'PrivateAccount') {
        throw new AppError({
          message: 'Profile is private',
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.FORBIDDEN,
        });
      }
      if (error?.status === 404 && error?.data?.exc_type === 'UserNotFound') {
        throw new AppError({
          message: `User not found: ${username}`,
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.NOT_FOUND,
        });
      }

      // Re-throw AppError instances
      if (error instanceof AppError) {
        throw error;
      }

      // For any other error, throw a generic service unavailable error
      throw new AppError({
        message: 'Failed to analyze profile. Please try again later.',
        code: ErrorCodes.SHOWABLE_ERROR,
        status: StatusCodes.SERVICE_UNAVAILABLE,
      });
    }
  }

  public async analyzePremium(
    username: string,
    userId: string,
  ): Promise<AnalysisResult> {
    const cached = await this.getFromCache(username, true);
    if (cached) return cached;

    try {
      const data = await creatorStatsService.analyzeByUsername(username, {
        limit: 50,
        includePhotos: true,
      });

      if (!data || 'error' in data || !data.profile) {
        throw new AppError({
          message: 'Failed to fetch profile data',
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.SERVICE_UNAVAILABLE,
        });
      }

      const profile = data.profile;
      const allStats = data.all;
      const reelsStats = data.reels;

      const statsForDisplay =
        reelsStats.posts_analyzed > 0 ? reelsStats : allStats;

      const engagementRate = Number(statsForDisplay.engagement_rate || 0);
      const avgViews = Number(statsForDisplay.avg_views || 0);
      const avgComments = Number(statsForDisplay.avg_comments || 0);

      const overallScore = this.computeOverallScore(engagementRate, avgViews);

      const baseMetrics = [
        {
          key: 'engagement_rate',
          label: 'Engagement rate',
          value: `${Math.round(engagementRate * 10) / 10}`,
          unit: '%',
        },
        {
          key: 'avg_views',
          label: 'Average reel views',
          value: Math.round(avgViews),
        },
        {
          key: 'avg_comments',
          label: 'Average comments',
          value: Math.round(avgComments),
        },
      ];

      const viralityFactor = Number(statsForDisplay.virality_factor || 0);
      const premiumMetrics = [
        {
          key: 'avg_likes',
          label: 'Average likes',
          value: Math.round(Number(statsForDisplay.avg_likes || 0)),
        },
        {
          key: 'posts_per_day',
          label: 'Average posts per day',
          value: Number(statsForDisplay.posts_per_day || 1).toFixed(1),
        },
        {
          key: 'virality_factor',
          label: 'Virality factor',
          value:
            viralityFactor >= 1000000
              ? `${(viralityFactor / 1000000).toFixed(1)}M`
              : viralityFactor >= 1000
                ? `${(viralityFactor / 1000).toFixed(1)}k`
                : viralityFactor.toFixed(1),
          unit: 'x',
          description: 'How your most viral post performed compared to median',
        },
      ];

      const recommendations = await this.generateAIRecommendations(
        statsForDisplay,
        profile,
      );

      const now = new Date().toISOString();

      const performanceReportNotificationsEnabled =
        await this.getPerformanceReportNotificationStatus(username, userId);

      const result: AnalysisResult = {
        id: `analysis-${Date.now()}`,
        username,
        analyzedAt: now,
        overallScore,
        metrics: [...baseMetrics, ...premiumMetrics],
        summary: `Analyzed ${allStats.posts_analyzed || 0} posts.`,
        profile: {
          username: String(profile.username || username),
          full_name: String(profile.full_name || ''),
          profile_pic_url: String(profile.profile_pic_url || ''),
          follower_count: Number(profile.follower_count || 0),
          following_count: Number(profile.following_count || 0),
          media_count: Number(profile.media_count || 0),
          is_verified: Boolean(profile.is_verified),
          is_private: Boolean(profile.is_private),
          biography: profile.biography ? String(profile.biography) : undefined,
          external_url: profile.external_url
            ? String(profile.external_url)
            : undefined,
        },
        recommendations,
        performance: data?.performance || undefined,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        performanceReportNotificationsEnabled,
        fromCache: false,
      };

      await this.setCache(username, true, result, this.PREMIUM_CACHE_TTL_MS);
      return result;
    } catch (error: any) {
      logger.error('analyzePremium failed', error);
      if (error?.status === 403 && error?.data?.exc_type === 'PrivateAccount') {
        throw new AppError({
          message: 'Profile is private',
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.FORBIDDEN,
        });
      }
      if (error?.status === 404 && error?.data?.exc_type === 'UserNotFound') {
        throw new AppError({
          message: `User not found: ${username}`,
          code: ErrorCodes.SHOWABLE_ERROR,
          status: StatusCodes.NOT_FOUND,
        });
      }
      return this.analyzeLite(username, userId);
    }
  }
}

export const analyzeService = new AnalyzeService();
