import { GenderEnum } from '~/types';
import OpenAI from 'openai';

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

interface OpenAICombinedResponse {
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

class OpenaiApiService {
  public openai: OpenAI;
  private defaultModel: string = 'gpt-5-nano';
  private defaultTemperature: number = 0;
  private openaiApiKey: string = env.OPENAI_API_KEY;

  constructor() {
    this.openai = new OpenAI({
      apiKey: this.openaiApiKey,
    });
  }

  public async analyzeUsersGenderAndRank(
    users: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = true,
  ): Promise<CombinedAnalysisResult> {
    try {
      const batchResults = await this.processBatch(
        users,
        username,
        useProfilePic,
      );

      // Log statistics
      if (env.NODE_ENV === 'development') {
        this.logAnalysisStatistics(batchResults);
      }

      return {
        result: batchResults,
        isFalsy: false,
      };
    } catch (error: unknown) {
      logger.error('Error in combined gender detection and ranking', { error });

      discordService.sendGenderAnalysisApiError({
        functionName: 'analyzeUsersGenderAndRank',
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
    useProfilePic: boolean = true,
  ): Promise<UserWithGenderAndScore[]> {
    try {
      const completion = await this.makeAnalysisApiRequest(
        batch,
        username,
        useProfilePic,
      );

      const parsedResponse = this.parseResponse(completion);
      return this.normalizeResponses(parsedResponse.results, batch);
    } catch (error) {
      return this.createDefaultBatchResults(batch);
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

  private getAnalysisPrompt(useProfilePic: boolean): string {
    if (useProfilePic) {
      return `You are a professional AI analyst specializing in gender detection and profile picture evaluation.

Your task is to:
1. Analyze each person's profile picture to determine their gender (male, female, or other)
2. Rate their profile picture attractiveness/visual appeal from 0-100

Gender Detection Guidelines:
- Analyze the person in the profile picture
- Use visual cues to determine gender
- If uncertain or no clear person visible, use "other"

Attractiveness Rating Guidelines (0-100):
- Focus on objective beauty standards and visual appeal
- Consider: photo quality, grooming, style, composition
- Real person photos should score higher than logos/objects
- No visible person or poor quality images: 0-30
- Average photos: 40-60
- High quality, attractive photos: 70-100

Output Format:
- Return only valid JSON without any formatting markers
- Include all users in your response

Example format:
{
  "results": [
    {
      "username": "user1",
      "gender": "male",
      "score": 85,
    },
    {
      "username": "user2", 
      "gender": "female",
      "score": 72,
    }
  ]
}`;
    } else {
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
  }

  private async makeAnalysisApiRequest(
    users: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = true,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    logger.info(
      'Making OpenAI request for combined gender detection and ranking',
      { useProfilePic },
    );

    try {
      const msgContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: `${this.getAnalysisPrompt(useProfilePic)}\n\nAnalyze these ${users.length} users. ${useProfilePic ? "Each user's profile image (if available) is shown below with their username labeled." : "Each user's username, full name, and biography are provided below."}`,
        },
      ];

      if (useProfilePic) {
        users.forEach((user, index) => {
          if (user.profile_pic_url && user.openaiAIData) {
            msgContent.push({
              type: 'image_url',
              image_url: user.openaiAIData,
            });
            msgContent.push({
              type: 'text',
              text: `Image ${index + 1} corresponds to username: ${user.username}`,
            });
          }
        });
      } else {
        users.forEach((user, index) => {
          msgContent.push({
            type: 'text',
            text: `User ${index + 1}:\nUsername: ${user.username}\nFull Name: ${user.full_name || ''}\nBiography: ${user.biography || ''}`,
          });
        });
      }

      return await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: useProfilePic
              ? `You are an AI data analysis agent specializing in gender detection and a professional mannequin photo analyst specializing in evaluating personnel pictures for attractiveness and visual appeal.`
              : `You are an AI data analysis agent specializing in gender detection using only text data. Do NOT use or consider any profile picture or image data.`,
          },
          {
            role: 'user',
            content: msgContent,
          },
        ],
        reasoning_effort: 'minimal',
        temperature: undefined, // Use default temperature for now
        // this.defaultModel === 'gpt-5-nano'
        //   ? undefined
        //   : this.defaultTemperature,
        response_format: { type: 'json_object' },
      });
    } catch (error) {
      logger.error('Error making OpenAI combined analysis request', { error });

      discordService.sendGenderAnalysisApiError({
        functionName: 'openai:makeAnalysisApiRequest',
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

  private parseResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
  ): OpenAICombinedResponse {
    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response from OpenAI');
    }

    try {
      const parsedResponse = JSON.parse(response);

      if (!parsedResponse.results || !Array.isArray(parsedResponse.results)) {
        throw new Error('Invalid response format: missing results array');
      }

      return parsedResponse;
    } catch (error) {
      logger.error('Failed to parse OpenAI combined response', {
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

export const openaiApiService = new OpenaiApiService();
