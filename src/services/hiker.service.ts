import axios, { AxiosError } from 'axios';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

import { discordService } from './discord.service';

interface User {
  pk: string;
  id: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_private: boolean;
  is_verified: boolean;
  biography?: string;
  is_business?: boolean;
}

type FollowersResponse = [User[], string | null];

export interface UserProfile {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  profile_pic_url_hd: string;
  is_verified: boolean;
  media_count: number;
  follower_count: number;
  following_count: number;
  biography: string;
  external_url: string;
  account_type: number;
  is_business: boolean;
  business_category_name: string;
  category_name: string;
}

class HikerApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: any,
    public endpoint?: string,
  ) {
    super(message);
    this.name = 'HikerApiError';
  }
}

class HikerService {
  private readonly baseUrl = 'https://api.hikerapi.com';
  private readonly apiKey: string;

  constructor() {
    const apiKey = env.HIKER_API_KEY;
    if (!apiKey) {
      throw new Error(
        '[Hiker API] HIKER_API_KEY environment variable is not set',
      );
    }
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    try {
      logger.info(
        `[Hiker API] Making request to ${endpoint} with params:`,
        JSON.stringify(params, null, 2),
      );

      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params: {
          ...params,
        },
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-access-key': this.apiKey,
        },
      });

      logger.info(
        `[Hiker API] Successful response from ${endpoint}:`,
        JSON.stringify(
          {
            status: response.status,
            statusText: response.statusText,
          },
          null,
          2,
        ),
      );

      return response.data;
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const data = error.response?.data;
        const config = error.config;

        // Log detailed error information
        logger.error(`[Hiker API] Request failed: ${error.message}`, {
          endpoint,
          url: `${this.baseUrl}${endpoint}`,
          method: config?.method,
          params: config?.params,
          status,
          statusText: error.response?.statusText,
          data,
          code: error.code,
          stack: error.stack,
        });

        // Do not send Discord alerts for private-account errors — these are
        // expected for many users and do not indicate infra issues.
        const isPrivateAccountError =
          data && data.exc_type === 'PrivateAccount';
        if (!isPrivateAccountError) {
          await discordService.sendHikerApiError({
            endpoint,
            status: status,
            params: config?.params,
            statusText: error.response?.statusText,
          });
        } else {
          logger.info(
            '[Hiker API] Private account detected, skipping Discord alert',
            {
              endpoint,
              params: config?.params,
            },
          );
        }

        // Create a specific error type for API errors
        throw new HikerApiError(
          `[Hiker API] Hiker API request failed: ${error.message}${data ? ` - ${JSON.stringify(data)}` : ''}`,
          status,
          data,
          endpoint,
        );
      }

      logger.error(
        `[Hiker API] Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          endpoint,
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
        },
      );

      throw error;
    }
  }

  /**
   * Fetch user medias in chunks via /v1/user/medias/chunk
   * Returns up to `limit` items (pagination handled internally)
   */
  async getUserMediasChunk(userId: string, limit = 20): Promise<any[]> {
    const items: any[] = [];
    let end_cursor: string | null = null;

    try {
      while (items.length < limit) {
        const params: Record<string, any> = { user_id: userId };
        if (end_cursor) params.end_cursor = end_cursor;

        const response = await this.request<any>(
          '/v1/user/medias/chunk',
          params,
        );

        // Expected response shape: [itemsArray, end_cursor]
        if (!Array.isArray(response) || response.length < 1) break;

        const pageItems = Array.isArray(response[0]) ? response[0] : [];
        items.push(...pageItems);

        end_cursor = response.length > 1 ? response[1] : null;
        if (!end_cursor) break;
      }

      return items.slice(0, limit);
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to fetch user medias for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch user clips (reels) in chunks via /v1/user/clips/chunk
   */
  async getUserClipsChunk(userId: string, limit = 20): Promise<any[]> {
    const items: any[] = [];
    let end_cursor: string | null = null;

    try {
      while (items.length < limit) {
        const params: Record<string, any> = { user_id: userId };
        if (end_cursor) params.end_cursor = end_cursor;

        const response = await this.request<any>(
          '/v1/user/clips/chunk',
          params,
        );

        if (!Array.isArray(response) || response.length < 1) break;

        const pageItems = Array.isArray(response[0]) ? response[0] : [];
        items.push(...pageItems);

        end_cursor = response.length > 1 ? response[1] : null;
        if (!end_cursor) break;
      }

      return items.slice(0, limit);
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to fetch user clips for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch user medias via /gql/user/medias with flat=true
   * Returns up to `limit` items (2 pages = ~24 items)
   */
  async getUserMediasGql(userId: string, limit = 24): Promise<any[]> {
    const items: any[] = [];
    let nextMaxId: string | null = null;

    try {
      while (items.length < limit) {
        const params: Record<string, any> = { user_id: userId, flat: true };
        if (nextMaxId) params.next_max_id = nextMaxId;

        const response = await this.request<any>('/gql/user/medias', params);

        if (!response || !response.items || !Array.isArray(response.items)) break;

        items.push(...response.items);

        if (!response.more_available || !response.next_max_id) break;
        nextMaxId = response.next_max_id;
      }

      return items.slice(0, limit);
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to fetch user medias via GQL for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getUserProfileById(userId: string): Promise<UserProfile> {
    try {
      const result = await this.request<UserProfile>('/v1/user/by/id', {
        id: userId,
      });
      return result;
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to get user profile for ID ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getUserProfileByUsername(username: string): Promise<UserProfile> {
    try {
      return await this.request<UserProfile>('/v1/user/by/username', {
        username,
      });
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to get user profile for username ${username}:`,
        error,
      );
      throw error;
    }
  }

  async getAllFollowers(userId: string): Promise<User[]> {
    const followers: User[] = [];
    let maxId: string | null = null;

    try {
      // Make at least one request to check if user has any followers
      const params: Record<string, any> = { user_id: userId, force: true };
      const response = await this.request<FollowersResponse>(
        '/gql/user/followers/chunk',
        params,
      );
      const [users, max_id] = response;

      followers.push(...users);

      // If there are more pages, continue fetching
      if (max_id) {
        maxId = max_id;
        let chunkCount = 1;
        while (true) {
          const nextParams: Record<string, any> = {
            ...params,
            end_cursor: maxId,
            force: true,
          };
          const nextResponse: FollowersResponse =
            await this.request<FollowersResponse>(
              '/gql/user/followers/chunk',
              nextParams,
            );
          const [nextUsers, nextMaxId] = nextResponse;

          followers.push(...nextUsers);

          if (!nextMaxId) {
            break;
          }

          maxId = nextMaxId;
          chunkCount++;
        }
      }

      return followers;
    } catch (error) {
      // Check if this is a 404 "Entries not found" error
      if (
        error instanceof HikerApiError &&
        error.status === 404 &&
        error.data?.detail === 'Entries not found'
      ) {
        logger.info(
          `[Hiker API] User ${userId} has no followers (404 response)`,
        );
        return [];
      }
      logger.error(
        `[Hiker API] Failed to fetch followers for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getAllFollowing(userId: string): Promise<User[]> {
    const following: User[] = [];
    let maxId: string | null = null;

    try {
      // Make at least one request to check if user has any following
      const params: Record<string, any> = { user_id: userId, force: true };
      const response = await this.request<FollowersResponse>(
        '/gql/user/following/chunk',
        params,
      );
      const [users, max_id] = response;

      following.push(...users);

      // If there are more pages, continue fetching
      if (max_id) {
        maxId = max_id;
        let chunkCount = 1;
        while (true) {
          const nextParams: Record<string, any> = {
            ...params,
            end_cursor: maxId,
            force: true,
          };
          const nextResponse: FollowersResponse =
            await this.request<FollowersResponse>(
              '/gql/user/following/chunk',
              nextParams,
            );
          const [nextUsers, nextMaxId] = nextResponse;

          following.push(...nextUsers);

          if (!nextMaxId) {
            break;
          }

          maxId = nextMaxId;
          chunkCount++;
        }
      }

      return following;
    } catch (error) {
      // Check if this is a 404 "Entries not found" error
      if (
        error instanceof HikerApiError &&
        error.status === 404 &&
        error.data?.detail === 'Entries not found'
      ) {
        logger.info(
          `[Hiker API] User ${userId} has no following (404 response)`,
        );
        return [];
      }
      logger.error(
        `[Hiker API] Failed to fetch following for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getRecentFollowsByUserId(userId: string) {
    try {
      const [result, max_id] = await this.request<FollowersResponse>(
        '/gql/user/following/chunk',
        { user_id: userId, force: false },
      );
      return result;
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to get recent follows for user ID ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getRecentFollowersByUserId(userId: string) {
    try {
      const [result, max_id] = await this.request<FollowersResponse>(
        '/gql/user/followers/chunk',
        { user_id: userId, force: true },
      );
      return result;
    } catch (error) {
      logger.error(
        `[Hiker API] Failed to get recent followers for user ID ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get following incrementally with callback for early processing
   * Calls onChunk with accumulated users when min count is reached
   */
  async getAllFollowingWithCallback(
    userId: string,
    minCountForCallback: number,
    onChunk?: (users: User[]) => Promise<void>,
  ): Promise<User[]> {
    const following: User[] = [];
    let maxId: string | null = null;
    let callbackTriggered = false;

    try {
      // Make at least one request to check if user has any following
      const params: Record<string, any> = { user_id: userId, force: true };
      const response = await this.request<FollowersResponse>(
        '/gql/user/following/chunk',
        params,
      );
      const [users, max_id] = response;

      following.push(...users);

      // Check if we should trigger the callback
      if (
        !callbackTriggered &&
        following.length >= minCountForCallback &&
        onChunk
      ) {
        callbackTriggered = true;
        logger.info(
          `[Hiker API] Triggering callback at ${following.length} following users`,
        );
        // Don't await this to keep fetching in parallel
        onChunk([...following]).catch((error) => {
          logger.error('Following callback failed:', error);
        });
      }

      // If there are more pages, continue fetching
      if (max_id) {
        maxId = max_id;
        let chunkCount = 1;
        while (true) {
          const nextParams: Record<string, any> = {
            ...params,
            end_cursor: maxId,
            force: true,
          };
          const nextResponse: FollowersResponse =
            await this.request<FollowersResponse>(
              '/gql/user/following/chunk',
              nextParams,
            );
          const [nextUsers, nextMaxId] = nextResponse;

          following.push(...nextUsers);

          // Check if we should trigger the callback
          if (
            !callbackTriggered &&
            following.length >= minCountForCallback &&
            onChunk
          ) {
            callbackTriggered = true;
            logger.info(
              `[Hiker API] Triggering callback at ${following.length} following users`,
            );
            // Don't await this to keep fetching in parallel
            onChunk([...following]).catch((error) => {
              logger.error('Following callback failed:', error);
            });
          }

          if (!nextMaxId) {
            break;
          }

          maxId = nextMaxId;
          chunkCount++;
        }
      }

      return following;
    } catch (error) {
      // Check if this is a 404 "Entries not found" error
      if (
        error instanceof HikerApiError &&
        error.status === 404 &&
        error.data?.detail === 'Entries not found'
      ) {
        logger.info(
          `[Hiker API] User ${userId} has no following (404 response)`,
        );
        return [];
      }
      logger.error(
        `[Hiker API] Failed to fetch following for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}

export const hikerService = new HikerService();
