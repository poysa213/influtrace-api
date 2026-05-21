import { GenderEnum } from '~/types';

import { logger } from '~/utils/logger';

/**
 * Minimal fallback analysis service.
 * Returns neutral/default values so callers don't break while we
 * migrate to the new analysis implementation.
 */

// Minimal user stub used by the fallback analysis service. Several callers
// populate additional Instagram fields; allow them as optional so object
// literals with extra properties are accepted by TypeScript.
// Public types exported for other analysis services that expect image data
export type UserWithImages = {
  username: string;
  is_business?: boolean;
  profile_pic_url?: string;
  full_name?: string;
  biography?: string;
  // gemini/multi-model specific prepared data blobs (if present)
  geminiAIData?: any;
  // generic image or model payloads used by other services
  [key: string]: any;
};

type UserStub = {
  username: string;
  is_business?: boolean;
  profile_pic_url?: string;
  full_name?: string;
  biography?: string;
  // allow other optional fields used across the codebase
  [key: string]: any;
};

type CombinedAnalysisResult = {
  result: Array<{ username: string; gender: GenderEnum; score: number }>;
  top_males: string[];
  top_females: string[];
  isFalsy: boolean;
};

class AnalysisService {
  // Accept the wider options object callers pass (username, rank, useProfilePic)
  public async analyzeUsersGenderAndRank({
    users,
    username,
    rank,
    useProfilePic,
  }: {
    users: UserStub[];
    username?: string;
    rank?: boolean;
    useProfilePic?: boolean;
  }): Promise<CombinedAnalysisResult> {
    logger.info('[ai-analysis] fallback analyzeUsersGenderAndRank called', {
      count: users.length,
    });
    const result = users.map((u) => ({
      username: u.username,
      gender: GenderEnum.NotDetected,
      score: 0,
    }));
    return { result, top_males: [], top_females: [], isFalsy: false };
  }
}

export const analysisService = new AnalysisService();
