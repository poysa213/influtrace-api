import { IUser } from '~/models';
import { EmbedBuilder, WebhookClient } from 'discord.js';

import { env } from '~/utils/env';
import { logger } from '~/utils/logger';

class DiscordService {
  private static instance: DiscordService;
  private webhookClients: Map<string, WebhookClient>;

  private constructor() {
    this.webhookClients = new Map();
    this.initializeWebhooks();
  }

  private initializeWebhooks() {
    try {
      // Initialize webhook clients for different channels
      const channels = {
        installs: env.DISCORD_INSTALLS_WEBHOOK_URL,
        revenueCat: env.DISCORD_REVENUECAT_WEBHOOK_URL,
        shares: env.DISCORD_SHARES_WEBHOOK_URL,
        k_logs: env.DISCORD_CRON_UPDATES_WEBHOOK_URL,
        k_errors: env.DISCORD_ERRORS_WEBHOOK_URL,
        k_auth_logs: env.DISCORD_AUTH_LOGS_WEBHOOK_URL,
        k_auth_feedback: env.DISCORD_AUTH_FEEDBACK_WEBHOOK_URL,
        k_feedback: env.DISCORD_FEEDBACK_WEBHOOK_URL,
        app_health: env.DISCORD_APP_HEALTH_WEBHOOK_URL,
        k_analysis: env.DISCORD_ANALYSIS_WEBHOOK_URL,
      };

      for (const [channel, url] of Object.entries(channels)) {
        if (url) {
          try {
            this.webhookClients.set(channel, new WebhookClient({ url }));
            logger.info(
              `[Discord] Successfully initialized webhook for channel: ${channel}`,
            );
          } catch (error) {
            logger.error(
              `[Discord] Failed to initialize webhook for channel ${channel}:`,
              error,
            );
          }
        } else {
          logger.warn(
            `[Discord] No webhook URL provided for channel: ${channel}`,
          );
        }
      }
    } catch (error) {
      logger.error('[Discord] Failed to initialize Discord webhooks:', error);
      throw error; // Re-throw to handle initialization failure
    }
  }

  public static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      try {
        DiscordService.instance = new DiscordService();
        logger.info('[Discord] DiscordService instance created successfully');
      } catch (error) {
        logger.error(
          '[Discord] Failed to create DiscordService instance:',
          error,
        );
        throw error;
      }
    }
    return DiscordService.instance;
  }

  private async sendWebhook(channel: string, embed: EmbedBuilder) {
    try {
      const webhook = this.webhookClients.get(channel);
      if (!webhook) {
        logger.warn(`[Discord] No webhook configured for channel: ${channel}`);
        return;
      }

      await webhook.send({ embeds: [embed] });
    } catch (error) {
      logger.error(
        `[Discord] Failed to send Discord webhook to ${channel}:`,
        error,
      );
      // You might want to add additional error handling here, like retries or fallback mechanisms
      throw error; // Re-throw to allow caller to handle the error
    }
  }

  // Helper to format errors so Discord shows readable message + details
  private formatError(errorMessage?: string, details?: any) {
    let message: string | undefined = undefined;
    let detailsStr: string | undefined = undefined;

    if (errorMessage && typeof errorMessage === 'string') {
      // Some callers pass objects via String(err) which becomes '[object Object]'
      if (errorMessage !== '[object Object]') {
        message = errorMessage;
      } else {
        // keep for details fallback
        detailsStr = errorMessage;
      }
    }

    if (details) {
      if (typeof details === 'string') {
        detailsStr = details;
      } else if (details instanceof Error) {
        detailsStr = JSON.stringify(
          {
            message: details.message,
            stack: details.stack,
            name: details.name,
          },
          null,
          2,
        );
      } else {
        try {
          detailsStr = JSON.stringify(details, null, 2);
        } catch (e) {
          detailsStr = String(details);
        }
      }
    }

    // If we have no message but detailsStr contains JSON or multi-line text,
    // use first line as a short message
    if (!message && detailsStr) {
      const firstLine = detailsStr.split('\n')[0];
      message = firstLine.slice(0, 256);
    }

    return { message, details: detailsStr };
  }

  // Install notifications
  async sendInstallNotification(
    userId: string,
    locationInfo: string,
    deviceId?: string,
  ) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('📱 New App Install')
        .setColor(0x00ff00)
        .addFields(
          { name: 'User ID', value: userId, inline: true },
          { name: 'Location', value: locationInfo, inline: true },
        )
        .setTimestamp();

      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      }

      await this.sendWebhook('installs', embed);
    } catch (error) {
      logger.error(
        `[Discord] Failed to send install notification for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async sendPrivateProfileLogNotification({
    event,
    user,
    details,
    db_user,
  }: {
    event: 'init' | 'success' | 'session_invalid' | 'error';
    user?: {
      username?: string;
      profile_pic_url?: string;
      follower_count?: number;
      following_count?: number;
    };
    details?: Record<string, any>;
    db_user: IUser;
  }) {
    // for init say that user has initiated account linking process
    switch (event) {
      case 'init':
        const embed = new EmbedBuilder()
          .setTitle('🔗 Profile Linking Initiated')
          .setColor(0x3498db)
          .setDescription(
            `User **${db_user._id.toString()}** has initiated the profile linking process.`,
          )
          .addFields(
            {
              name: 'Device ID',
              value: db_user.deviceId || 'N/A',
              inline: false,
            },
            {
              name: 'Location',
              value: db_user.location || 'N/A',
              inline: false,
            },
          )
          .setTimestamp();

        if (user?.profile_pic_url) {
          embed.setThumbnail(user.profile_pic_url);
        }

        if (details) {
          embed.addFields({
            name: 'Details',
            value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``,
            inline: false,
          });
        }

        await this.sendWebhook('k_auth_logs', embed);
        break;
      case 'success':
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Private Profile Linked Successfully')
          .setColor(0x2ecc71)
          .setDescription(
            `User **${user?.username || db_user._id.toString()}** has successfully linked their profile.`,
          )
          .setTimestamp()
          .addFields(
            {
              name: 'Device ID',
              value: db_user.deviceId || 'N/A',
              inline: false,
            },
            {
              name: 'Location',
              value: db_user.location || 'N/A',
              inline: false,
            },
            { name: 'Username', value: user?.username || 'N/A', inline: false },
            {
              name: 'Follower Count',
              value: user?.follower_count?.toString() || 'N/A',
              inline: true,
            },
            {
              name: 'Following Count',
              value: user?.following_count?.toString() || 'N/A',
              inline: true,
            },
          );

        if (details) {
          successEmbed.addFields({
            name: 'Details',
            value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``,
            inline: false,
          });
        }

        if (user?.profile_pic_url) {
          successEmbed.setThumbnail(user.profile_pic_url);
        }

        await this.sendWebhook('k_auth_logs', successEmbed);
        break;
      case 'session_invalid':
        const sessionEmbed = new EmbedBuilder()
          .setTitle('❗ Profile Session Invalid')
          .setColor(0xe74c3c)
          .setDescription(
            `User **${user?.username || db_user._id.toString()}** has an invalid session for their profile.`,
          )
          .setTimestamp()
          .addFields(
            {
              name: 'Device ID',
              value: db_user.deviceId || 'N/A',
              inline: false,
            },
            {
              name: 'Location',
              value: db_user.location || 'N/A',
              inline: false,
            },
          );

        // add the details as an indented JSON string
        if (details) {
          sessionEmbed.addFields({
            name: 'Details',
            value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``,
            inline: false,
          });
        }

        await this.sendWebhook('k_auth_logs', sessionEmbed);
        break;
      case 'error':
        const errorEmbed = new EmbedBuilder()
          .setTitle('🚨 Profile Linking Error')
          .setColor(0xff0000)
          .setDescription(
            `An error occurred while trying to link profile for user **${user?.username || db_user._id.toString()}**.`,
          )
          .setTimestamp()
          .addFields(
            {
              name: 'Device ID',
              value: db_user.deviceId || 'N/A',
              inline: false,
            },
            {
              name: 'Location',
              value: db_user.location || 'N/A',
              inline: false,
            },
          );

        // add the details as an indented JSON string
        if (details) {
          errorEmbed.addFields({
            name: 'Details',
            value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``,
            inline: false,
          });
        }

        await this.sendWebhook('k_auth_logs', errorEmbed);
        break;
      default:
        break;
    }
  }

  // RevenueCat notifications
  async sendRevenueCatNotification({
    userId,
    eventType,
    productId,
    store,
    countryCode,
    location,
    deviceId,
    color = 0x00ff00,
    environment,
  }: {
    userId: string;
    eventType: string;
    productId: string;
    store: string;
    countryCode?: string;
    location?: string;
    deviceId?: string;
    color?: number; // Default to green
    environment: 'PRODUCTION' | 'SANDBOX'; // Environment type
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('💰 RevenueCat Event')
        .setColor(color)
        .addFields(
          {
            name: `(Environment ${environment})`,
            value: '\n',
            inline: false,
          },
          { name: 'User ID', value: userId, inline: true },
          { name: 'Event Type', value: eventType, inline: true },
          { name: 'Product ID', value: productId, inline: true },
          { name: 'Store', value: store, inline: true },
          { name: 'Country', value: countryCode || 'N/A', inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Katch AI Subscriptions' });

      // Add location field if available
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: true });
      }

      // Add device ID if available
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      }

      if (environment === 'SANDBOX') {
        await this.sendWebhook('k_logs', embed);
      } else {
        await this.sendWebhook('revenueCat', embed);
      }
    } catch (error) {
      logger.error(
        `[Discord] Failed to send RevenueCat notification for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  // Share notifications
  async sendShareNotification(
    userId: string,
    shareType: string,
    targetUsername: string,
    location?: string,
    deviceId?: string,
  ) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('📤 Share Activity')
        .setColor(0x9b59b6)
        .addFields(
          { name: 'User ID', value: userId, inline: true },
          { name: 'Event Type', value: shareType, inline: true },
          { name: 'Target Username', value: targetUsername, inline: true },
        )
        .setTimestamp();

      // Add location field if available
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: true });
      }

      // Add device ID if available
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      }

      await this.sendWebhook('shares', embed);
    } catch (error) {
      logger.error(
        `[Discord] Failed to send share notification for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async sendHikerApiError({
    endpoint,
    status,
    statusText,
    params,
  }: {
    endpoint: string;
    status?: number;
    statusText?: string;
    params?: Record<string, any>;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Hiker API Error')
        .setColor(0xff0000)
        .addFields(
          { name: 'Endpoint', value: endpoint, inline: true },
          { name: 'Status', value: status?.toString() || 'N/A', inline: true },
          { name: 'Status Text', value: statusText || 'N/A', inline: false },
        )
        .setTimestamp();

      if (params) {
        embed.addFields({
          name: 'Parameters',
          value: JSON.stringify(params, null, 2),
          inline: false,
        });
      }

      await this.sendWebhook('k_errors', embed);
    } catch (error) {
      logger.error(
        `[Discord] Failed to send Hiker API error for endpoint ${endpoint}:`,
        error,
      );
      throw error;
    }
  }

  async sendGenderAnalysisApiError({
    functionName,
    status,
    statusText,
    username,
  }: {
    functionName: string;
    status?: number;
    statusText?: string;
    username?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🚨 Gender Analysis API Error')
        .setColor(0xff0000)
        .addFields(
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'Function', value: functionName, inline: false },
          { name: 'Status', value: status?.toString() || 'N/A', inline: false },
          { name: 'Status Text', value: statusText || 'N/A', inline: false },
        )
        .setTimestamp();

      await this.sendWebhook('k_errors', embed);
    } catch (error) {
      logger.error(
        `[Discord] Failed to send Gemini API error for function ${functionName}:`,
        error,
      );
      throw error;
    }
  }

  async sendAIFallbackLog({
    fromService,
    toService,
    chunkIndex,
    totalChunks,
    username,
    maleCount,
    femaleCount,
    otherCount,
  }: {
    fromService: string;
    toService: string;
    chunkIndex: number;
    totalChunks: number;
    username?: string;
    maleCount: number;
    femaleCount: number;
    otherCount: number;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle(
          `AI Fallback: ${fromService} → ${toService} (chunk ${chunkIndex + 1}/${totalChunks})`,
        )
        .setColor(0xffa500)
        .addFields(
          {
            name: 'From Service',
            value: fromService.toUpperCase(),
            inline: true,
          },
          { name: 'To Service', value: toService.toUpperCase(), inline: true },
          { name: 'Username', value: username || 'N/A', inline: false },
          { name: 'Males Count', value: maleCount.toString(), inline: true },
          {
            name: 'Females Count',
            value: femaleCount.toString(),
            inline: true,
          },
          { name: 'Other Count', value: otherCount.toString(), inline: true },
        )
        .setTimestamp();
      await this.sendWebhook('k_errors', embed);
    } catch (error) {
      logger.error('[Discord] Failed to send AI fallback log:', error);
    }
  }

  // Legacy method for backward compatibility
  async sendOpenAIFallbackLog({
    chunkIndex,
    totalChunks,
    username,
    maleCount,
    femaleCount,
    otherCount,
  }: {
    chunkIndex: number;
    totalChunks: number;
    username?: string;
    maleCount: number;
    femaleCount: number;
    otherCount: number;
  }) {
    return this.sendAIFallbackLog({
      fromService: 'gemini',
      toService: 'openai',
      chunkIndex,
      totalChunks,
      username,
      maleCount,
      femaleCount,
      otherCount,
    });
  }

  // Profile linking feedback notification
  async sendProfileLinkingFeedback({
    userId,
    feedback,
    deviceId,
    location,
    instagramUsername,
    profilePicUrl,
  }: {
    userId: string;
    feedback: string;
    deviceId?: string;
    location?: string;
    instagramUsername?: string;
    profilePicUrl?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('📝 Profile Linking Feedback')
        .setColor(0x7289da)
        .addFields(
          { name: 'User ID', value: userId, inline: false },
          { name: 'Feedback', value: feedback, inline: false },
        )
        .setTimestamp();

      if (instagramUsername) {
        embed.addFields({
          name: 'Last Used Instagram Username',
          value: instagramUsername,
          inline: false,
        });
      }
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: false });
      }
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: false });
      }
      if (profilePicUrl) {
        embed.setThumbnail(profilePicUrl);
      }

      await this.sendWebhook('k_auth_feedback', embed);
    } catch (error) {
      logger.error('[Discord] Failed to send profile linking feedback:', error);
    }
  }

  // App feedback notification
  async sendAppFeedback({
    userId,
    liked,
    deviceId,
    location,
    instagramUsername,
    profilePicUrl,
  }: {
    userId: string;
    liked: boolean;
    deviceId?: string;
    location?: string;
    instagramUsername?: string;
    profilePicUrl?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle(liked ? '👍 User Liked the App' : '👎 User Disliked the App')
        .setColor(liked ? 0x00ff00 : 0xff0000) // Green for liked, red for disliked
        .addFields({ name: 'User ID', value: userId, inline: false })
        .setTimestamp();

      if (instagramUsername) {
        embed.addFields({
          name: 'Instagram Username',
          value: instagramUsername,
          inline: false,
        });
      }
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: false });
      }
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: false });
      }
      if (profilePicUrl) {
        embed.setThumbnail(profilePicUrl);
      }

      await this.sendWebhook('k_feedback', embed);
    } catch (error) {
      logger.error('[Discord] Failed to send app feedback:', error);
      throw error;
    }
  }

  // App feedback text notification
  async sendAppFeedbackText({
    userId,
    feedback,
    deviceId,
    location,
    instagramUsername,
    profilePicUrl,
  }: {
    userId: string;
    feedback: string;
    deviceId?: string;
    location?: string;
    instagramUsername?: string;
    profilePicUrl?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('💬 App Feedback')
        .setColor(0x3498db)
        .addFields(
          { name: 'User ID', value: userId, inline: false },
          { name: 'Feedback', value: feedback, inline: false },
        )
        .setTimestamp();

      if (instagramUsername) {
        embed.addFields({
          name: 'Instagram Username',
          value: instagramUsername,
          inline: false,
        });
      }
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: false });
      }
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: false });
      }
      if (profilePicUrl) {
        embed.setThumbnail(profilePicUrl);
      }

      await this.sendWebhook('k_feedback', embed);
    } catch (error) {
      logger.error('[Discord] Failed to send app feedback text:', error);
      throw error;
    }
  }

  // Red flag detection fallback notification
  async sendRedFlagFallbackNotification({
    fromService = 'gemini',
    toService = 'mistral',
    username,
  }: {
    fromService?: string;
    toService?: string;
    username?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Red Flag Detection API Fallback')
        .setColor(0xffa500)
        .addFields(
          {
            name: 'From Service',
            value: fromService.toUpperCase(),
            inline: true,
          },
          { name: 'To Service', value: toService.toUpperCase(), inline: true },
        )
        .setTimestamp();

      if (username) {
        embed.addFields({ name: 'Username', value: username, inline: true });
      }

      await this.sendWebhook('k_errors', embed);
    } catch (error) {
      logger.error(
        '[Discord] Failed to send red flag fallback notification:',
        error,
      );
      throw error;
    }
  }

  // Gender analysis results notification
  async sendGenderAnalysisResults({
    username,
    is_private,
    userId,
    maleCount,
    femaleCount,
    otherCount,
  }: {
    username?: string;
    is_private?: boolean;
    userId?: string;
    maleCount: number;
    femaleCount: number;
    otherCount: number;
  }) {
    try {
      const totalCount = maleCount + femaleCount + otherCount;
      const embed = new EmbedBuilder()
        .setTitle('🎭 Gender Analysis Results (In Recent Follows)')
        .setColor(0x9b59b6)
        .addFields(
          { name: 'Males', value: maleCount.toString(), inline: true },
          { name: 'Females', value: femaleCount.toString(), inline: true },
          { name: 'Others', value: otherCount.toString(), inline: true },
          {
            name: 'Total Analyzed',
            value: totalCount.toString(),
            inline: true,
          },
        )
        .setTimestamp();

      if (username) {
        embed.addFields({ name: 'Username', value: username, inline: true });
      }

      if (is_private) {
        embed.addFields({
          name: 'Profile Visibility',
          value: `${is_private ? 'Private' : 'Public'}`,
          inline: true,
        });
      }

      if (userId) {
        embed.addFields({ name: 'User ID', value: userId, inline: true });
      }

      await this.sendWebhook('k_logs', embed);
    } catch (error) {
      logger.error('[Discord] Failed to send gender analysis results:', error);
      throw error;
    }
  }

  // Analysis lifecycle notifications (started / success / error)
  async sendAnalysisStarted({
    username,
    userId,
    deviceId,
    context,
    numTargets,
  }: {
    username?: string;
    userId?: string;
    deviceId?: string;
    context?: string;
    numTargets?: number;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Analysis Started')
        .setColor(0x3498db)
        .setTimestamp()
        .addFields(
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'User ID', value: userId || 'N/A', inline: true },
        );

      if (context)
        embed.addFields({ name: 'Context', value: context, inline: true });
      if (deviceId)
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      if (typeof numTargets === 'number') {
        embed.addFields({
          name: 'Targets',
          value: String(numTargets),
          inline: true,
        });
      }

      const channel = this.webhookClients.has('k_analysis')
        ? 'k_analysis'
        : 'k_logs';
      await this.sendWebhook(channel, embed);
    } catch (error) {
      logger.error(
        '[Discord] Failed to send analysis started notification:',
        error,
      );
      throw error;
    }
  }

  async sendAnalysisSuccess({
    username,
    userId,
    deviceId,
    context,
    analysisId,
    summary,
    fromCache,
  }: {
    username?: string;
    userId?: string;
    deviceId?: string;
    context?: string;
    analysisId?: string;
    summary?: string;
    fromCache?: boolean;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Analysis Completed')
        .setColor(0x2ecc71)
        .setTimestamp()
        .addFields(
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'User ID', value: userId || 'N/A', inline: true },
        );

      if (context)
        embed.addFields({ name: 'Context', value: context, inline: true });
      if (deviceId)
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      if (analysisId)
        embed.addFields({
          name: 'Analysis ID',
          value: analysisId,
          inline: true,
        });
      if (typeof fromCache === 'boolean') {
        embed.addFields({
          name: 'Source',
          value: fromCache ? 'Cache' : 'Fresh',
          inline: true,
        });
      }
      if (summary) {
        embed.addFields({ name: 'Summary', value: summary, inline: false });
      }

      const channel = this.webhookClients.has('k_analysis')
        ? 'k_analysis'
        : 'k_logs';
      await this.sendWebhook(channel, embed);
    } catch (error) {
      logger.error(
        '[Discord] Failed to send analysis success notification:',
        error,
      );
      throw error;
    }
  }

  async sendAnalysisError({
    username,
    userId,
    deviceId,
    context,
    errorMessage,
    details,
  }: {
    username?: string;
    userId?: string;
    deviceId?: string;
    context?: string;
    errorMessage?: string;
    details?: any;
  }) {
    try {
      // Format error message/details more robustly. callers sometimes pass
      // objects which resulted in `[object Object]` in Discord embeds.
      const formattedError = this.formatError(errorMessage, details);

      const embed = new EmbedBuilder()
        .setTitle('❌ Analysis Error')
        .setColor(0xff0000)
        .setTimestamp()
        .addFields(
          { name: 'Username', value: username || 'N/A', inline: true },
          { name: 'User ID', value: userId || 'N/A', inline: true },
        );

      if (context)
        embed.addFields({ name: 'Context', value: context, inline: true });
      if (deviceId)
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });

      if (formattedError.message) {
        embed.addFields({
          name: 'Error',
          value: formattedError.message,
          inline: false,
        });
      }
      if (formattedError.details) {
        // Put details in a code block for readability
        embed.addFields({
          name: 'Details',
          value: `\n\`\`\`json\n${formattedError.details}\n\`\`\``,
          inline: false,
        });
      }

      const channel = this.webhookClients.has('k_analysis')
        ? 'k_analysis'
        : 'k_logs';
      await this.sendWebhook(channel, embed);
    } catch (error) {
      logger.error(
        '[Discord] Failed to send analysis error notification:',
        error,
      );
      throw error;
    }
  }

  // App health notification - sends a heartbeat message to Discord
  async sendAppHealthNotification() {
    try {
      const embed = new EmbedBuilder()
        .setTitle('✅ App Health Check')
        .setColor(0x00ff00)
        .setDescription(`${env.APP_NAME} server is running and healthy!`)
        .addFields(
          { name: 'Environment', value: env.NODE_ENV, inline: true },
          { name: 'App URL', value: env.APP_URL, inline: true },
          { name: 'Timestamp', value: new Date().toISOString(), inline: false },
        )
        .setTimestamp();

      await this.sendWebhook('app_health', embed);
      logger.info('[Discord] App health notification sent successfully');
    } catch (error) {
      logger.error('[Discord] Failed to send app health notification:', error);
      throw error;
    }
  }

  async sendRejectedTrackingNotification({
    userId,
    instagramUsername,
    reason,
    details,
    location,
    deviceId,
    followerCount,
    followingCount,
    profilePictureUrl,
  }: {
    userId: string;
    instagramUsername: string;
    reason: string;
    details: string;
    location?: string;
    deviceId?: string;
    followerCount?: number;
    followingCount?: number;
    profilePictureUrl?: string;
  }) {
    try {
      // Determine color based on reason
      let color = 0xff0000; // Default red
      if (reason === 'Profile Too Large') {
        color = 0xffa500; // Orange for too many followers/following
      } else if (reason === 'Private Profile') {
        color = 0x800080; // Purple for private profiles
      }

      const embed = new EmbedBuilder()
        .setTitle('❌ Tracking Request Rejected')
        .setColor(color)
        .addFields(
          { name: 'User ID', value: userId, inline: true },
          {
            name: 'Instagram Username',
            value: instagramUsername,
            inline: true,
          },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Details', value: details, inline: false },
        )
        .setTimestamp();

      // Add location field if available
      if (location) {
        embed.addFields({ name: 'Location', value: location, inline: true });
      }

      // Add device ID if available
      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId, inline: true });
      }

      if (followerCount !== undefined) {
        embed.addFields({
          name: 'Follower Count',
          value: followerCount.toString(),
          inline: true,
        });
      }

      if (followingCount !== undefined) {
        embed.addFields({
          name: 'Following Count',
          value: followingCount.toString(),
          inline: true,
        });
      }

      if (profilePictureUrl) {
        embed.setImage(profilePictureUrl);
      }

      // Send only to refusals channel
      await this.sendWebhook('refusals', embed);
      logger.info(
        `[Discord] Rejected tracking notification sent successfully for user: ${userId}`,
      );
    } catch (error) {
      logger.error(
        `[Discord] Failed to send rejected tracking notification for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  // Client cron log notification
  async sendClientCronLogNotification({
    timestamp,
    deviceId,
    message,
    success,
    details,
    userId,
  }: {
    timestamp?: string;
    deviceId?: string;
    message?: string;
    success?: boolean;
    details?: Record<string, any>;
    userId: string;
  }) {
    try {
      // Set color based on success status: green for success, red for failure, purple for default
      let color = 0x800080; // Purple (default)
      if (success === true) {
        color = 0x00ff00; // Green for success
      } else if (success === false) {
        color = 0xff0000; // Red for failure
      }

      const embed = new EmbedBuilder()
        .setTitle('📱 Client Cron Execution')
        .setColor(color)
        .addFields(
          { name: 'User ID', value: userId, inline: true },
          {
            name: 'Device ID',
            value: deviceId || 'N/A',
            inline: true,
          },
          {
            name: 'Timestamp',
            value: timestamp || new Date().toISOString(),
            inline: false,
          },
        )
        .setTimestamp();

      if (success !== undefined) {
        embed.addFields({
          name: 'Status',
          value: success ? '✅ Success' : '❌ Failed',
          inline: true,
        });
      }

      if (message) {
        embed.addFields({ name: 'Message', value: message, inline: false });
      }

      if (details) {
        embed.addFields({
          name: 'Details',
          value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``,
          inline: false,
        });
      }

      await this.sendWebhook('k_logs', embed);
      logger.info('[Discord] Client cron log notification sent successfully');
    } catch (error) {
      logger.error(
        '[Discord] Failed to send client cron log notification:',
        error,
      );
      throw error;
    }
  }

  // Self notification log
  async sendSelfNotificationLog({
    userId,
    title,
    body,
    profilePictureUrl,
    deviceId,
    location,
    instagramUsername,
  }: {
    userId: string;
    title: string;
    body: string;
    profilePictureUrl?: string;
    deviceId?: string;
    location?: string;
    instagramUsername?: string;
  }) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('📱 Self Notification Sent')
        .setColor(0x9b59b6)
        .setDescription(`**${title}**\n${body}`)
        .addFields({ name: 'User ID', value: userId, inline: true })
        .setTimestamp();

      if (instagramUsername) {
        embed.addFields({
          name: 'Instagram Username',
          value: instagramUsername,
          inline: true,
        });
      }

      if (deviceId) {
        embed.addFields({ name: 'Device ID', value: deviceId });
      }

      if (location) {
        embed.addFields({ name: 'Location', value: location });
      }

      if (profilePictureUrl) {
        embed.setThumbnail(profilePictureUrl);
      }

      await this.sendWebhook('k_logs', embed);
      logger.info('[Discord] Self notification log sent successfully');
    } catch (error) {
      logger.error('[Discord] Failed to send self notification log:', error);
      throw error;
    }
  }
}

export const discordService = DiscordService.getInstance();
