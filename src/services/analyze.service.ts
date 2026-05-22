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
import { geminiApiService } from './gemini-api.service';
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

  private computeOverallScore(
    engagementRate: number,
    avgViews: number,
    saveRate: number,
  ) {
    const engagementScore = Math.min(100, Math.round((engagementRate / 10) * 100));
    const viewScore = Math.min(100, Math.round(Math.log10(Math.max(1, avgViews)) * 20));
    const saveScore = Math.min(100, Math.round(saveRate * 20));
    return Math.round(engagementScore * 0.5 + viewScore * 0.25 + saveScore * 0.25);
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

  private buildRecommendationsPrompt(
    stats: CreatorStatistics,
    profile: CreatorProfile,
  ): string {
    return `You are a top-tier Instagram growth strategist. Analyze these metrics and give 3 precise, data-backed recommendations. Be specific — reference actual numbers and compare them to industry benchmarks.

ACCOUNT OVERVIEW
Username: @${profile.username || 'unknown'}
Followers: ${(profile.follower_count || 0).toLocaleString()}
Following: ${(profile.following_count || 0).toLocaleString()}

POST PERFORMANCE (last ${stats.posts_analyzed || 0} posts)
- Engagement rate: ${Number(stats.engagement_rate || 0).toFixed(2)}%
- Avg views: ${Math.round(Number(stats.avg_views || 0)).toLocaleString()}
- Avg likes: ${Math.round(Number(stats.avg_likes || 0)).toLocaleString()}
- Avg comments: ${Math.round(Number(stats.avg_comments || 0)).toLocaleString()}
- Save rate: ${Number(stats.save_rate || 0).toFixed(2)}% (people bookmarking)
- Share rate: ${Number(stats.share_rate || 0).toFixed(2)}% (people sharing)
- Comments per 1k views: ${Number(stats.comment_depth || 0).toFixed(1)}

CONTENT BREAKDOWN
- Reels: ${stats.reels_count || 0}
- Carousels: ${stats.carousels_count || 0}
- Photos: ${stats.photos_count || 0}
- Best performing format: ${stats.best_type || 'unknown'}

INDUSTRY BENCHMARKS
- Good engagement rate: 1-3% for <10k followers, 0.5-1.5% for 10k-100k
- Good save rate: 0.5-2% (higher = content people value long-term)
- Good share rate: 0.1-0.5% (higher = viral potential)
- Comments per 1k views > 5 indicates strong community

Return JSON only: { "recommendations": ["rec1", "rec2", "rec3"] }

Each recommendation must be a plain string — NOT an object. No keys, no fields, just text.

Each recommendation must:
1. Reference a specific metric with its actual value
2. Explain why it matters
3. Give a concrete action the creator can take right now

Cover different angles: one about content strategy, one about engagement tactics, one about growth opportunity. Make them sound like real, hard-won advice from someone who's grown accounts.`;
  }

  private parseRecommendations(content: string | null | undefined): string[] {
    if (!content) return [];
    try {
      const parsed = JSON.parse(content);
      const recommendations = parsed.recommendations || [];
      if (!Array.isArray(recommendations)) return [];
      return recommendations
        .slice(0, 3)
        .filter((r): r is string => typeof r === 'string');
    } catch {
      return [];
    }
  }

  private async generateRecommendationsViaGemini(
    prompt: string,
  ): Promise<string[] | null> {
    try {
      const result = await geminiApiService.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const recommendations = this.parseRecommendations(result.response.text());
      return recommendations.length > 0 ? recommendations : null;
    } catch (error) {
      logger.error('[AnalyzeService] Gemini recommendations failed', error);
      return null;
    }
  }

  private async generateRecommendationsViaOpenAI(
    prompt: string,
  ): Promise<string[] | null> {
    try {
      const completion = await openaiApiService.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an Instagram growth strategist. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      const recommendations = this.parseRecommendations(content);
      return recommendations.length > 0 ? recommendations : null;
    } catch (error) {
      logger.error('[AnalyzeService] OpenAI recommendations failed', error);
      return null;
    }
  }

  private async generateAIRecommendations(
    stats: CreatorStatistics,
    profile: CreatorProfile,
  ): Promise<string[]> {
    const prompt = this.buildRecommendationsPrompt(stats, profile);

    const geminiResult = await this.generateRecommendationsViaGemini(prompt);
    if (geminiResult) return geminiResult;

    logger.info('[AnalyzeService] Falling back to OpenAI for recommendations');
    const openaiResult = await this.generateRecommendationsViaOpenAI(prompt);
    if (openaiResult) return openaiResult;

    logger.error('[AnalyzeService] Both Gemini and OpenAI failed to generate recommendations');
    return [];
  }

  public async analyzeLite(
    username: string,
    userId: string,
  ): Promise<AnalysisResult> {
    const cached = await this.getFromCache(username, false);
    if (cached) return cached;

    try {
      const data = await creatorStatsService.analyzeByUsername(username, {
        limit: 24,
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
      const saveRate = Number(statsForDisplay.save_rate || 0);

      const overallScore = this.computeOverallScore(engagementRate, avgViews, saveRate);

      const metrics = [
        {
          key: 'engagement_rate',
          label: 'Engagement rate',
          value: `${Math.round(engagementRate * 10) / 10}`,
          unit: '%',
          description: 'Likes + comments as a percentage of your followers',
        },
        {
          key: 'avg_views',
          label: 'Average views',
          value: Math.round(avgViews),
          description: 'Average views across your analyzed posts',
        },
        {
          key: 'save_rate',
          label: 'Save rate',
          value: `${Math.round(saveRate * 10) / 10}`,
          unit: '%',
          description: 'How often people bookmark your content',
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
        summary: allStats.error || `Analyzed ${allStats.posts_analyzed || 0} posts.`,
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
        performance: data.performance,
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
        limit: 24,
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
      const avgLikes = Number(statsForDisplay.avg_likes || 0);
      const saveRate = Number(statsForDisplay.save_rate || 0);
      const shareRate = Number(statsForDisplay.share_rate || 0);
      const commentDepth = Number(statsForDisplay.comment_depth || 0);
      const viralityFactor = Number(statsForDisplay.virality_factor || 0);

      const overallScore = this.computeOverallScore(engagementRate, avgViews, saveRate);

      const baseMetrics = [
        {
          key: 'engagement_rate',
          label: 'Engagement rate',
          value: `${Math.round(engagementRate * 10) / 10}`,
          unit: '%',
          description: 'Likes + comments as a percentage of your followers',
        },
        {
          key: 'avg_views',
          label: 'Average views',
          value: Math.round(avgViews),
          description: 'Average views across your analyzed posts',
        },
        {
          key: 'avg_likes',
          label: 'Average likes',
          value: Math.round(avgLikes),
          description: 'Average likes across your analyzed posts',
        },
        {
          key: 'save_rate',
          label: 'Save rate',
          value: `${Math.round(saveRate * 10) / 10}`,
          unit: '%',
          description: 'How often people bookmark your content',
        },
      ];

      const premiumMetrics = [
        {
          key: 'share_rate',
          label: 'Share rate',
          value: `${Math.round(shareRate * 10) / 10}`,
          unit: '%',
          description: 'How often people share your content',
        },
        {
          key: 'comment_depth',
          label: 'Comments per 1k views',
          value: Math.round(commentDepth * 10) / 10,
          description: 'Conversation quality on your posts',
        },
        {
          key: 'virality_factor',
          label: 'Peak performance',
          value:
            viralityFactor >= 1000
              ? `${(viralityFactor / 1000).toFixed(1)}k`
              : viralityFactor.toFixed(1),
          unit: 'x',
          description: 'How your best post compares to your average',
        },
        {
          key: 'best_type',
          label: 'Best performing format',
          value: statsForDisplay.best_type === 'reel' ? 'Reels' : statsForDisplay.best_type === 'carousel' ? 'Carousels' : statsForDisplay.best_type === 'photo' ? 'Photos' : 'N/A',
          description: 'Content type with highest average views',
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
        summary: allStats.error || `Analyzed ${allStats.posts_analyzed || 0} posts.`,
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
        performance: data.performance,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        performanceReportNotificationsEnabled,
        fromCache: false,
      };

      if (recommendations.length > 0) {
        await this.setCache(username, true, result, this.PREMIUM_CACHE_TTL_MS);
      }
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
