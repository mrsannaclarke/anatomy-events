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

const envWebAppUrl =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SHEET_SYNC_WEB_APP_URL : undefined;
const envApiToken =
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SHEET_SYNC_API_TOKEN : undefined;

export const SHEET_SYNC_CONFIG: SheetSyncConfig = {
  webAppUrl: (extra.sheetSyncWebAppUrl || envWebAppUrl || DEFAULT_WEB_APP_URL).trim(),
  apiToken: (extra.sheetSyncApiToken || envApiToken || '').trim(),
};

export function hasSheetSyncConfig(config: SheetSyncConfig = SHEET_SYNC_CONFIG): boolean {
  return config.webAppUrl.length > 0;
}
