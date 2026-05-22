import {
  GenerativeModel,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
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

interface GeminiCombinedResponse {
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

class GeminiApiService {
  private genAI: GoogleGenerativeAI;
  public model: GenerativeModel;
  private defaultModel: string = 'gemini-2.5-flash';
  private geminiApiKey: string = env.GEMINI_API_KEY;

  safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  constructor() {
    this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.defaultModel,
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });
  }

  public async analyzeUsersGenderAndRank(
    users: UserWithImages[],
    username: string = '',
    useProfilePic: boolean = true,
  ): Promise<CombinedAnalysisResult> {
    const BATCH_SIZE = 500; // Reduced batch size due to combined processing

    logger.info(
      '[GeminiApiService] Starting combined gender detection and ranking',
      {
        userCount: users.length,
        batchSize: BATCH_SIZE,
        useProfilePic,
      },
    );

    try {
      // Process each batch
      const { batch_res, isFalsy } = await this.processBatch(
        users,
        username,
        useProfilePic,
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
      return this.createDefaultResult(users);
    }
  }

  /**
   * ------------------------------------------------------------------------------------------------------------------------------------------------
   * Private helper methods
   * ------------------------------------------------------------------------------------------------------------------------------------------------
   */
  private async processBatch(
    batch: UserWithImages[],
    username: string,
    useProfilePic: boolean = true,
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
      const res = this.normalizeResponses(parsedResponse.results, batch);
      return {
        batch_res: res,
        isFalsy: false,
      };
    } catch (error) {
      // Return default results for this batch in case of error
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

  private createDefaultBatchResults(users: User[]): {
    batch_res: UserWithGenderAndScore[];
    isFalsy: boolean;
  } {
    return {
      batch_res: users.map((user) => ({
        ...user,
        gender: GenderEnum.Other,
        score: 0,
      })),
      isFalsy: true,
    };
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
        - Do not wrap in markdown code blocks
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
        - Do not wrap in markdown code blocks
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
  ): Promise<string> {
    logger.info(
      'Making Gemini request for combined gender detection and ranking',
      { useProfilePic },
    );

    try {
      const parts = [];

      // Add system prompt
      parts.push({
        text: `${this.getAnalysisPrompt(useProfilePic)}
        
        Analyze these ${users.length} users.
        ${
          useProfilePic
            ? "Each user's profile image (if available) is shown below with their username labeled."
            : "Each user's username, full name, and biography are provided below."
        }`,
      });

      if (useProfilePic) {
        users.forEach((user, index) => {
          if (user.profile_pic_url && user.geminiAIData) {
            parts.push(user.geminiAIData);
            parts.push({
              text: `Image ${index + 1} corresponds to username: ${user.username}`,
            });
          }
        });
      } else {
        users.forEach((user, index) => {
          parts.push({
            text: `User ${index + 1}:\nUsername: ${user.username}\nFull Name: ${user.full_name || ''}\nBiography: ${user.biography || ''}`,
          });
        });
      }

      const result = await this.model.generateContent({
        contents: [
          {
            role: 'user',
            parts: parts,
          },
        ],
        safetySettings: this.safetySettings,
      });

      if (result.response.promptFeedback?.blockReason) {
        throw new Error(
          `Content blocked: ${result.response.promptFeedback.blockReason}`,
        );
      }

      return result.response.text();
    } catch (error) {
      logger.error('Error making Gemini combined analysis request', { error });

      await discordService.sendGenderAnalysisApiError({
        functionName: 'gemini:makeAnalysisApiRequest',
        username: username || 'N/A',
        status: error instanceof Response ? error.status : 500,
        statusText:
          error instanceof Response
            ? error.statusText
            : 'Unknown error check the logs',
      });

      throw error;
    }
  }

  private parseResponse(response: string): GeminiCombinedResponse {
    if (!response) {
      throw new Error('No response from Gemini');
    }

    try {
      const parsedResponse = JSON.parse(response);

      if (!parsedResponse.results || !Array.isArray(parsedResponse.results)) {
        throw new Error('Invalid response format: missing results array');
      }

      return parsedResponse;
    } catch (error) {
      logger.error('Failed to parse Gemini combined response', {
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
    const processedResults = results.map((item) => {
      const user = users.find((u) => u.username === item.username);
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
    });

    // Handle missing users
    const processedUsernames = new Set(processedResults.map((r) => r.username));
    const missingUsers = users.filter(
      (user) => !processedUsernames.has(user.username),
    );

    if (missingUsers.length > 0) {
      logger.warn('Missing analysis for users', {
        count: missingUsers.length,
        usernames: missingUsers.map((u) => u.username),
      });

      processedResults.push(
        ...missingUsers.map((user) => ({
          ...user,
          gender: GenderEnum.Other,
          score: 0,
        })),
      );
    }

    return processedResults;
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

export const geminiApiService = new GeminiApiService();
