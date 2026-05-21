import { Mistral } from '@mistralai/mistralai';
import { GenderEnum } from '~/types';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

import { UserWithImages } from './ai-analysis.service';
import { discordService } from './discord.service';

interface User {
  username: string;
  is_business?: boolean;
  profile_pic_url?: string;
  full_name?: string;
  biography?: string;
}

interface UserWithGenderAndScore extends User {
  gender: GenderEnum;
  score: number;
  description?: string; // Optional field for additional info
}

interface MistralCombinedResponse {
  results: Array<{
    username: string;
    gender: string;
    score: number;
    description?: string;
  }>;
}

interface CombinedAnalysisResult {
  result: UserWithGenderAndScore[];
  isFalsy: boolean;
}

class MistralApiService {
  public mistral: Mistral;
  private defaultModel: string = 'ministral-8b-latest';
  private defaultTemperature: number = 0;
  private mistralApiKey: string = env.MISTRAL_API_KEY;

  constructor() {
    this.mistral = new Mistral({
      apiKey: this.mistralApiKey,
    });
  }

  public async analyzeUsersGenderAndRank(
    users: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = true,
  ): Promise<CombinedAnalysisResult> {
    try {
      const { batch_res, isFalsy } = await this.processBatch(
        users,
        username,
        false, // Always use text-only analysis for Mistral
      );

      // Log statistics
      if (env.NODE_ENV === 'development') {
        this.logAnalysisStatistics(batch_res);
      }

      return {
        result: batch_res,
        isFalsy: isFalsy,
      };
    } catch (error: unknown) {
      logger.error('Error in combined gender detection and ranking', { error });

      await discordService.sendGenderAnalysisApiError({
        functionName: 'mistral:analyzeUsersGenderAndRank',
        status: error instanceof Response ? error.status : 500,
        statusText:
          error instanceof Response
            ? error.statusText
            : 'Unknown error check the logs',
      });

      return this.createDefaultResult(users);
    }
  }

  /**
   * ------------------------------------------------------------------------------------------------------------------------------------------------
   * private helper methods for gender detection
   * ------------------------------------------------------------------------------------------------------------------------------------------------
   */

  private async processBatch(
    batch: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = false, // Always false for Mistral
  ): Promise<{
    batch_res: UserWithGenderAndScore[];
    isFalsy: boolean;
  }> {
    try {
      const completion = await this.makeAnalysisApiRequest(
        batch,
        username,
        useProfilePic,
      );

      const parsedResponse = this.parseResponse(completion);
      const results = this.normalizeResponses(parsedResponse.results, batch);
      return {
        batch_res: results,
        isFalsy: false,
      };
    } catch (error) {
      return {
        batch_res: this.createDefaultBatchResults(batch),
        isFalsy: true,
      };
    }
  }

  private createDefaultResult(users: User[]): CombinedAnalysisResult {
    const defaultResults: UserWithGenderAndScore[] = users.map((user) => ({
      ...user,
      gender: GenderEnum.Other,
      score: 0,
    }));

    return {
      result: defaultResults,
      isFalsy: true,
    };
  }

  private createDefaultBatchResults(users: User[]): UserWithGenderAndScore[] {
    return users.map((user) => ({
      ...user,
      gender: GenderEnum.Other,
      score: 0,
    }));
  }

  private getAnalysisPrompt(): string {
    return `You are a professional AI analyst specializing in gender detection using only text data.

Your task is to:
1. Analyze each person's username, full name, and biography to determine their gender (male, female, or other).
2. Do NOT use or consider any profile picture or image data.
3. If uncertain, use "other".

Output Format:
- Return only valid JSON without any formatting markers
- Include all users in your response

Example format:
{
  "results": [
    {
      "username": "user1",
      "gender": "male",
      "score": 0
    },
    {
      "username": "user2", 
      "gender": "female",
      "score": 0
    }
  ]
}`;
  }

  private async makeAnalysisApiRequest(
    users: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = false, // Always false for Mistral
  ): Promise<string> {
    logger.info(
      'Making Mistral request for combined gender detection and ranking (text-only)',
    );

    try {
      const messages: any[] = [];

      // Add system message
      messages.push({
        role: 'system',
        content: `You are an AI data analysis agent specializing in gender detection using only text data. Do NOT use or consider any profile picture or image data.`,
      });

      // Create user message content
      let userContent = `${this.getAnalysisPrompt()}\n\nAnalyze these ${users.length} users. Each user's username, full name, and biography are provided below.`;

      users.forEach((user, index) => {
        userContent += `\n\nUser ${index + 1}:\nUsername: ${user.username}\nFull Name: ${user.full_name || ''}\nBiography: ${user.biography || ''}`;
      });

      messages.push({
        role: 'user',
        content: userContent,
      });

      const completion = await this.mistral.chat.complete({
        model: this.defaultModel,
        messages,
        temperature: this.defaultTemperature,
        responseFormat: { type: 'json_object' },
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from Mistral');
      }

      if (typeof content === 'string') {
        return content;
      } else if (Array.isArray(content)) {
        // If content is an array of ContentChunk, extract text from TextChunk types
        return content
          .filter(
            (chunk): chunk is { type: 'text'; text: string } =>
              typeof chunk === 'object' &&
              chunk !== null &&
              'type' in chunk &&
              chunk.type === 'text' &&
              'text' in chunk,
          )
          .map((chunk) => chunk.text)
          .join('');
      } else {
        throw new Error('Unexpected content type from Mistral');
      }
    } catch (error) {
      logger.error('Error making Mistral combined analysis request', { error });

      discordService.sendGenderAnalysisApiError({
        functionName: 'mistral:makeAnalysisApiRequest',
        status: error instanceof Response ? error.status : 500,
        username: username !== '' ? username : 'N/A',
        statusText:
          error instanceof Response
            ? error.statusText
            : 'Unknown error check the logs',
      });

      throw error;
    }
  }

  private parseResponse(response: string): MistralCombinedResponse {
    if (!response) {
      throw new Error('No response from Mistral');
    }

    try {
      const parsedResponse = JSON.parse(response);

      if (!parsedResponse.results || !Array.isArray(parsedResponse.results)) {
        throw new Error('Invalid response format: missing results array');
      }

      return parsedResponse;
    } catch (error) {
      logger.error('Failed to parse Mistral combined response', {
        error,
        responseSnippet: response?.substring(0, 500),
      });

      throw error;
    }
  }

  private normalizeResponses(
    results: Array<{ username: string; gender: string; score: number }>,
    users: User[],
  ): UserWithGenderAndScore[] {
    const processedResults = results
      .map((item) => {
        const user = users.find((u) => u.username === item.username);
        if (!user) return null;
        const normalizedGender = item.gender.toLowerCase().trim();
        const isValidGender = ['male', 'female', 'other'].includes(
          normalizedGender,
        );

        if (!isValidGender) {
          logger.warn(`Invalid gender response for ${item.username}`, {
            gender: item.gender,
          });
        }

        // Ensure score is within valid range
        const normalizedScore = Math.max(0, Math.min(100, item.score || 0));

        return {
          ...user,
          username: item.username,
          gender: (isValidGender ? normalizedGender : 'other') as GenderEnum,
          score: normalizedScore,
        } as UserWithGenderAndScore;
      })
      .filter((item) => item !== null);

    // ensure only unique usernames
    const uniqueUsernames = new Set<string>();
    const uniqueResults: UserWithGenderAndScore[] = [];
    processedResults.forEach((result) => {
      if (!uniqueUsernames.has(result.username)) {
        uniqueUsernames.add(result.username);
        uniqueResults.push(result);
      }
    });

    // Handle missing users
    const processedUsernames = new Set(uniqueResults.map((r) => r.username));
    const missingUsers = users.filter(
      (user) => !processedUsernames.has(user.username),
    );

    if (missingUsers.length > 0) {
      logger.warn('Missing analysis for users', {
        count: missingUsers.length,
        usernames: missingUsers.map((u) => u.username),
      });

      uniqueResults.push(
        ...missingUsers.map((user) => ({
          ...user,
          gender: GenderEnum.Other,
          score: 0,
        })),
      );
    }

    return uniqueResults;
  }

  private logAnalysisStatistics(results: UserWithGenderAndScore[]): void {
    const maleCount = results.filter(
      (r) => r.gender === GenderEnum.Male,
    ).length;
    const femaleCount = results.filter(
      (r) => r.gender === GenderEnum.Female,
    ).length;
    const otherCount = results.filter(
      (r) => r.gender === GenderEnum.Other,
    ).length;

    const averageScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const maxScore = Math.max(...results.map((r) => r.score));
    const minScore = Math.min(...results.map((r) => r.score));

    logger.info('Combined analysis statistics', {
      genderDistribution: {
        male: maleCount,
        female: femaleCount,
        other: otherCount,
      },
      scoreStatistics: {
        average: Math.round(averageScore * 100) / 100,
        max: maxScore,
        min: minScore,
      },
    });
  }
}

export const mistralApiService = new MistralApiService();
