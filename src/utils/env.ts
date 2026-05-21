import { config } from 'dotenv';

config();

export type Environment = 'development' | 'production' | 'test';

export type ENV = {
  NODE_ENV: Environment;
  PORT: number;
  APP_URL: string;
  APP_NAME: string;
  APP_ADDRESS: string;

  DATABASE_URL: string;

  ALLOWED_ORIGINS: string[];

  DISCORD_INSTALLS_WEBHOOK_URL: string;
  DISCORD_REVENUECAT_WEBHOOK_URL: string;
  DISCORD_SHARES_WEBHOOK_URL: string;
  DISCORD_CRON_UPDATES_WEBHOOK_URL: string;
  DISCORD_ERRORS_WEBHOOK_URL: string;
  DISCORD_AUTH_LOGS_WEBHOOK_URL: string;
  DISCORD_AUTH_FEEDBACK_WEBHOOK_URL: string;
  DISCORD_FEEDBACK_WEBHOOK_URL: string;
  DISCORD_APP_HEALTH_WEBHOOK_URL: string;
  DISCORD_ANALYSIS_WEBHOOK_URL: string;

  HIKER_API_KEY: string;

  OPENAI_API_KEY: string;
  GEMINI_API_KEY: string;
  MISTRAL_API_KEY: string;
  GENDERAPI_API_KEY: string;

  ONESIGNAL_APP_ID: string;
  ONESIGNAL_API_KEY: string;

  IP_API_KEY: string;

  REVENUECAT_WEBHOOK_SECRET: string;
  REVENUECAT_SECRET_KEY: string;
};

const resolveAllowedOrigins = () => {
  const origins = resolveEnvValue(
    'ALLOWED_ORIGINS',
    'http://localhost:3000',
  ) as string;
  if (!origins) return [];
  return origins.split(',').map((origin) => origin.trim());
};

const resolveEnv = (): ENV => {
  return {
    NODE_ENV: resolveEnvValue('NODE_ENV', 'development') as Environment,
    PORT: resolveEnvValue('PORT', 5000, 'number') as number,
    APP_URL: resolveEnvValue('APP_URL', 'http://localhost:5000') as string,
    APP_NAME: resolveEnvValue('APP_NAME', '') as string,
    APP_ADDRESS: resolveEnvValue('APP_ADDRESS', '') as string,
    ALLOWED_ORIGINS: resolveAllowedOrigins(),
    DATABASE_URL: resolveEnvValue('DATABASE_URL') as string,

    DISCORD_INSTALLS_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_INSTALLS_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_REVENUECAT_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_REVENUECAT_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_SHARES_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_SHARES_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_CRON_UPDATES_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_CRON_UPDATES_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_ERRORS_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_ERRORS_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_AUTH_LOGS_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_AUTH_LOGS_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_AUTH_FEEDBACK_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_AUTH_FEEDBACK_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_FEEDBACK_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_FEEDBACK_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_APP_HEALTH_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_APP_HEALTH_WEBHOOK_URL',
      '',
    ) as string,
    DISCORD_ANALYSIS_WEBHOOK_URL: resolveEnvValue(
      'DISCORD_ANALYSIS_WEBHOOK_URL',
      '',
    ) as string,

    HIKER_API_KEY: resolveEnvValue('HIKER_API_KEY', '') as string,

    REVENUECAT_WEBHOOK_SECRET: resolveEnvValue(
      'REVENUECAT_WEBHOOK_SECRET',
      '',
    ) as string,
    REVENUECAT_SECRET_KEY: resolveEnvValue(
      'REVENUECAT_SECRET_KEY',
      '',
    ) as string,
    OPENAI_API_KEY: resolveEnvValue('OPENAI_API_KEY', '') as string,
    GEMINI_API_KEY: resolveEnvValue('GEMINI_API_KEY', '') as string,
    MISTRAL_API_KEY: resolveEnvValue('MISTRAL_API_KEY', '') as string,
    GENDERAPI_API_KEY: resolveEnvValue('GENDERAPI_API_KEY', '') as string,

    ONESIGNAL_APP_ID: resolveEnvValue('ONESIGNAL_APP_ID', '') as string,
    ONESIGNAL_API_KEY: resolveEnvValue('ONESIGNAL_API_KEY', '') as string,

    IP_API_KEY: resolveEnvValue('IP_API_KEY', '') as string,
  };
};

export const env = resolveEnv();

function resolveEnvValue(
  key: string,
  defaultValue?: string | number | boolean,
  expects: 'string' | 'number' | 'boolean' = 'string',
): string | number | boolean {
  let value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    return expects === 'boolean' ? false : '';
  }
  if (expects === 'number') {
    return Number(value);
  }
  if (expects === 'boolean') {
    return ['true', '1', 'yes', 'True'].includes(value);
  }

  return value.replace(
    /\${([^}]+)}/g,
    (_, varName) => process.env[varName] || '',
  );
}
