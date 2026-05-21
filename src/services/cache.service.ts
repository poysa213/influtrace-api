import { logger } from '~/utils/logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheEntry<any>>;
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public set<T>(key: string, data: T): void {
    // if the key already exists, dont overwrite it
    if (
      this.cache.has(key) &&
      Date.now() - this.cache.get(key)!.timestamp < this.CACHE_TTL
    ) {
      logger.debug(
        `[Cache] Key already exists and is not expired, not overwriting: ${key}`,
      );
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    logger.debug(`Cache set for key: ${key}`);
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      logger.debug(`[Cache] Cache expired for key: ${key}`);
      return null;
    }

    logger.debug(`[Cache] Cache hit for key: ${key}`);
    return entry.data as T;
  }

  public delete(key: string): void {
    this.cache.delete(key);
    logger.debug(`[Cache] Cache deleted for key: ${key}`);
  }

  public clear(): void {
    this.cache.clear();
    logger.debug('[Cache] Cache cleared');
  }
}

export const cacheService = CacheService.getInstance();
