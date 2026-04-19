import Constants from 'expo-constants';

export interface SheetSyncConfig {
  webAppUrl: string;
  apiToken: string;
}

const extra = ((Constants.expoConfig?.extra ??
  Constants.manifest2?.extra ??
  {}) as {
  sheetSyncWebAppUrl?: string;
  sheetSyncApiToken?: string;
});

export const DEFAULT_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbywkjIVhLk8D2ZnrMlIh5OGZNBYFeC4w3WMMVz-6irRqAfXVVchZAySyE2UPB0qLRHMVg/exec';
const LEGACY_BLOCKED_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbzENbuqqAeEB6s3foq95axE-cSm8UdLb1SWrII-BHD8D8fVNRrt5M3Z2dFPmV6z_mjEPA/exec';

const envWebAppUrl =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SHEET_SYNC_WEB_APP_URL : undefined;
const envApiToken =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SHEET_SYNC_API_TOKEN : undefined;

function resolveWebAppUrl(): string {
  const explicitEnvUrl = (envWebAppUrl || '').trim();
  if (explicitEnvUrl) {
    return explicitEnvUrl;
  }

  const manifestUrl = (extra.sheetSyncWebAppUrl || '').trim();
  if (manifestUrl && manifestUrl !== LEGACY_BLOCKED_WEB_APP_URL) {
    return manifestUrl;
  }

  return DEFAULT_WEB_APP_URL;
}

export const SHEET_SYNC_CONFIG: SheetSyncConfig = {
  webAppUrl: resolveWebAppUrl(),
  apiToken: (extra.sheetSyncApiToken || envApiToken || '').trim(),
};

export function hasSheetSyncConfig(config: SheetSyncConfig = SHEET_SYNC_CONFIG): boolean {
  return config.webAppUrl.length > 0;
}
