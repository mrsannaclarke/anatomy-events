import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  ALLOWED_GOOGLE_USERS,
  AUTH_FRAMEWORK_CONFIG,
  AUTH_TYPES,
  GUEST_ALLOWED_NAMES,
  GUEST_PASSWORD,
  STAFF_PERMISSIONS,
  type AuthType,
  type AllowedGoogleUser,
  type StaffPermission,
} from '@/constants/auth-permissions';

WebBrowser.maybeCompleteAuthSession();

export type FrameworkUser = {
  email: string;
  displayName: string;
  matchNames: string[];
  canViewInfo: boolean;
  authType: AuthType;
  disablePayoutAccess?: boolean;
  mode: 'google' | 'guest';
};

type AuthFrameworkContextValue = {
  status: 'bypass' | 'signed_out' | 'signed_in';
  isHydrating: boolean;
  user: FrameworkUser | null;
  viewerName: string;
  viewerOverrideName: string | null;
  effectiveAuthType: AuthType | null;
  canAccessAdminTools: boolean;
  canAccessAdminToolsForViewer: boolean;
  errorMessage: string | null;
  config: typeof AUTH_FRAMEWORK_CONFIG;
  authTypes: typeof AUTH_TYPES;
  staffPermissions: StaffPermission[];
  allowedGoogleUsers: AllowedGoogleUser[];
  guestAllowedNames: string[];
  setViewerOverrideName: (name: string | null) => void;
  resolvePermissionsForName: (name: string) => StaffPermission | null;
  resolveGoogleAllowlistUser: (email: string) => AllowedGoogleUser | null;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: (name: string, password: string) => void;
  signOut: () => void;
};

const AuthFrameworkContext = createContext<AuthFrameworkContextValue | null>(null);
const AUTH_USER_STORAGE_KEY = 'anatomy-events.auth-user.v1';
const VIEWER_OVERRIDE_STORAGE_KEY = 'anatomy-events.viewer-override-name.v1';
const GOOGLE_SIGN_IN_TIMEOUT_MS = 20000;
const PINNED_SUPER_ADMIN_EMAILS = new Set<string>([
  'ladyshytattoos@gmail.com',
  'events.anatomytattoo@gmail.com',
  'event.anatomytattoo@gmail.com',
]);

function readWebStorage(key: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeWebStorage(key: string, value: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore web storage failures.
  }
}

function removeWebStorage(key: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore web storage failures.
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isPinnedSuperAdminEmail(email: string): boolean {
  return PINNED_SUPER_ADMIN_EMAILS.has(normalizeKey(email));
}

function applyPinnedRoleOverrides(user: FrameworkUser): FrameworkUser {
  if (!isPinnedSuperAdminEmail(user.email)) return user;
  const normalized = new Set(user.matchNames.map((entry) => normalizeKey(entry)));
  const matchNames = user.matchNames.length > 0 ? [...user.matchNames] : [];
  if (!normalized.has('shy')) matchNames.unshift('Shy');
  if (!normalized.has('lady shy')) matchNames.push('Lady Shy');
  return {
    ...user,
    displayName: 'Lady Shy',
    matchNames,
    canViewInfo: true,
    authType: 'super_admin',
    disablePayoutAccess: false,
  };
}

function resolvePermissionsForNameInternal(name: string): StaffPermission | null {
  const key = normalizeKey(name);
  if (!key) return null;
  return STAFF_PERMISSIONS.find((entry) => normalizeKey(entry.name) === key) ?? null;
}

function resolveGoogleAllowlistUserInternal(email: string): AllowedGoogleUser | null {
  const key = normalizeKey(email);
  if (!key) return null;
  return ALLOWED_GOOGLE_USERS.find((entry) => normalizeKey(entry.email) === key) ?? null;
}

function inferMatchNames(email: string, googleName: string): string[] {
  const local = email.split('@')[0] ?? '';
  const guesses = [local, googleName]
    .map((value) => value.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  guesses.forEach((value) => {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function isFrameworkUser(value: unknown): value is FrameworkUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FrameworkUser>;
  const payoutAccessTypeValid =
    candidate.disablePayoutAccess === undefined || typeof candidate.disablePayoutAccess === 'boolean';
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.displayName === 'string' &&
    Array.isArray(candidate.matchNames) &&
    typeof candidate.canViewInfo === 'boolean' &&
    typeof candidate.authType === 'string' &&
    payoutAccessTypeValid &&
    (candidate.mode === 'google' || candidate.mode === 'guest')
  );
}

function resolveWebRedirectUri(): string {
  const explicit = process.env.EXPO_PUBLIC_GOOGLE_WEB_REDIRECT_URI;
  if (explicit && explicit.trim()) return explicit.trim();

  if (typeof window !== 'undefined') {
    const origin = String(window.location.origin || '').replace(/\/+$/, '');
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return `${origin}/`;

    const path = String(window.location.pathname || '/');
    const firstSegment = path.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('github.io') && firstSegment) {
      return `${origin}/${firstSegment}/`;
    }
    return `${origin}/`;
  }

  return 'http://localhost:8081/';
}

async function fetchGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google user info failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { email?: string; name?: string };
  if (!payload.email) {
    throw new Error('Google sign-in did not return an email.');
  }

  return {
    email: payload.email,
    name: payload.name ?? payload.email,
  };
}

export function AuthFrameworkProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<FrameworkUser | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(AUTH_FRAMEWORK_CONFIG.requireAuth);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const viewerOverrideName: string | null = null;

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const webRedirectUri = Platform.OS === 'web' ? resolveWebRedirectUri() : undefined;

  const [request, response, promptAsync] = Google.useAuthRequest({
    scopes: ['openid', 'profile', 'email'],
    iosClientId: iosClientId ?? 'missing-ios-client-id',
    androidClientId: androidClientId ?? 'missing-android-client-id',
    webClientId: webClientId ?? 'missing-web-client-id',
    redirectUri: webRedirectUri,
  });

  const canSignInWithGoogle = useMemo(() => {
    if (!AUTH_FRAMEWORK_CONFIG.enableGoogleSignIn) return false;
    if (Platform.OS === 'web') return Boolean(webClientId);
    return Boolean(iosClientId || androidClientId);
  }, [androidClientId, iosClientId, webClientId]);

  useEffect(() => {
    // View-As testing mode is retired; clear any previously persisted override.
    void AsyncStorage.removeItem(VIEWER_OVERRIDE_STORAGE_KEY);
    removeWebStorage(VIEWER_OVERRIDE_STORAGE_KEY);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateUser() {
      try {
        let raw = await AsyncStorage.getItem(AUTH_USER_STORAGE_KEY);
        if (!raw) raw = readWebStorage(AUTH_USER_STORAGE_KEY);
        if (!isMounted || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!isFrameworkUser(parsed)) return;

        if (parsed.mode === 'guest' && !AUTH_FRAMEWORK_CONFIG.enableGuestSignIn) {
          await AsyncStorage.removeItem(AUTH_USER_STORAGE_KEY);
          return;
        }

        if (parsed.mode === 'google') {
          const allowlisted = resolveGoogleAllowlistUserInternal(parsed.email);
          if (ALLOWED_GOOGLE_USERS.length > 0 && !allowlisted) {
            await AsyncStorage.removeItem(AUTH_USER_STORAGE_KEY);
            return;
          }
          if (allowlisted) {
            setUser(
              applyPinnedRoleOverrides({
                email: allowlisted.email,
                displayName: allowlisted.displayName,
                matchNames: allowlisted.matchNames,
                canViewInfo: allowlisted.canViewInfo,
                authType: allowlisted.authType,
                disablePayoutAccess: allowlisted.disablePayoutAccess,
                mode: 'google',
              }),
            );
            return;
          }
        }

        setUser(parsed);
      } catch {
        if (!isMounted) return;
      } finally {
        if (isMounted) setIsHydrating(false);
      }
    }

    void hydrateUser();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isHydrating) return;
    void (async () => {
      try {
        if (user) {
          const serialized = JSON.stringify(user);
          await AsyncStorage.setItem(AUTH_USER_STORAGE_KEY, serialized);
          writeWebStorage(AUTH_USER_STORAGE_KEY, serialized);
        } else {
          await AsyncStorage.removeItem(AUTH_USER_STORAGE_KEY);
          removeWebStorage(AUTH_USER_STORAGE_KEY);
        }
      } catch {
        // Ignore persistence failures.
      }
    })();
  }, [isHydrating, user]);

  useEffect(() => {
    if (!response) return;

    if (response.type !== 'success') {
      if (response.type === 'error') {
        const maybeError = (response as { error?: { message?: string }; params?: { error_description?: string } })
          .error?.message ||
          (response as { params?: { error_description?: string } }).params?.error_description;
        setErrorMessage(maybeError ? String(maybeError) : 'Google sign-in failed.');
      }
      return;
    }

    const accessToken = response.authentication?.accessToken;
    if (!accessToken) {
      setErrorMessage('Google sign-in succeeded but no access token was returned.');
      return;
    }

    void (async () => {
      try {
        const info = await fetchGoogleUserInfo(accessToken);
        const allowlisted = resolveGoogleAllowlistUserInternal(info.email);

        if (ALLOWED_GOOGLE_USERS.length > 0 && !allowlisted) {
          setUser(null);
          setErrorMessage(`Signed in as ${info.email}, but this account is not on the allowlist.`);
          return;
        }

        const nextUser: FrameworkUser = allowlisted
          ? {
              email: allowlisted.email,
              displayName: allowlisted.displayName,
              matchNames: allowlisted.matchNames,
              canViewInfo: allowlisted.canViewInfo,
              authType: allowlisted.authType,
              disablePayoutAccess: allowlisted.disablePayoutAccess,
              mode: 'google',
            }
          : {
              email: info.email,
              displayName: info.name,
              matchNames: inferMatchNames(info.email, info.name),
              canViewInfo: false,
              authType: 'artist',
              disablePayoutAccess: false,
              mode: 'google',
            };

        setUser(applyPinnedRoleOverrides(nextUser));
        setErrorMessage(null);
      } catch (error) {
        setUser(null);
        setErrorMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
      }
    })();
  }, [response]);

  const status: AuthFrameworkContextValue['status'] = useMemo(() => {
    if (!AUTH_FRAMEWORK_CONFIG.requireAuth) return 'bypass';
    return user ? 'signed_in' : 'signed_out';
  }, [user]);

  const effectiveAuthType = useMemo<AuthType | null>(() => {
    if (!user) return null;
    return user.authType;
  }, [user]);

  const canAccessAdminTools = useMemo(() => {
    if (status === 'bypass') return true;
    return effectiveAuthType === 'super_admin' || effectiveAuthType === 'admin';
  }, [effectiveAuthType, status]);

  const canAccessAdminToolsForViewer = useMemo(() => canAccessAdminTools, [canAccessAdminTools]);

  function setViewerOverrideName(_: string | null) {
    // View-As testing mode is retired; keep legacy storage cleared.
    void AsyncStorage.removeItem(VIEWER_OVERRIDE_STORAGE_KEY);
    removeWebStorage(VIEWER_OVERRIDE_STORAGE_KEY);
  }

  const viewerName = useMemo(() => {
    if (status === 'bypass') return 'Anna';
    if (user?.matchNames?.length) return user.matchNames[0];
    if (user?.displayName) return user.displayName.split(' ')[0] || '';
    return '';
  }, [status, user?.displayName, user?.matchNames]);

  async function signInWithGoogle() {
    if (!AUTH_FRAMEWORK_CONFIG.enableGoogleSignIn) {
      setErrorMessage('Google sign-in framework is configured but currently disabled.');
      return;
    }

    if (!canSignInWithGoogle) {
      setErrorMessage(
        Platform.OS === 'web'
          ? 'Google sign-in on web requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env.local file.'
          : 'Google sign-in on mobile requires EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and/or EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.',
      );
      return;
    }

    if (!request) {
      setErrorMessage('Google sign-in is not ready yet. Please try again.');
      return;
    }

    setErrorMessage(null);
    type PromptResult = Awaited<ReturnType<typeof promptAsync>>;
    const result = (await Promise.race([
      promptAsync(),
      new Promise<PromptResult | { type: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ type: 'timeout' }), GOOGLE_SIGN_IN_TIMEOUT_MS);
      }),
    ])) as PromptResult | { type: 'timeout' };

    if (result.type === 'timeout') {
      setErrorMessage('Google sign-in timed out. Close any Google popup and try again.');
      return;
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      setErrorMessage('Google sign-in was cancelled.');
    }
  }

  function signInAsGuest(name: string, password: string) {
    if (!AUTH_FRAMEWORK_CONFIG.enableGuestSignIn) {
      setErrorMessage('Guest sign-in framework is configured but currently disabled.');
      return;
    }

    const requestedName = normalizeKey(name);
    const matchedName = GUEST_ALLOWED_NAMES.find((candidate) => normalizeKey(candidate) === requestedName);
    if (!matchedName) {
      setErrorMessage('Guest name is not allowlisted.');
      return;
    }

    if (String(password || '') !== GUEST_PASSWORD) {
      setErrorMessage('Guest password is incorrect.');
      return;
    }

    setUser({
      email: `guest:${matchedName.toLowerCase()}`,
      displayName: `${matchedName} (Guest)`,
      matchNames: [matchedName],
      canViewInfo: false,
      authType: 'counter_guest',
      disablePayoutAccess: false,
      mode: 'guest',
    });
    setErrorMessage(null);
  }

  function signOut() {
    setUser(null);
    setErrorMessage(null);
  }

  const value: AuthFrameworkContextValue = {
    status,
    isHydrating,
    user,
    viewerName,
    viewerOverrideName,
    effectiveAuthType,
    canAccessAdminTools,
    canAccessAdminToolsForViewer,
    errorMessage,
    config: AUTH_FRAMEWORK_CONFIG,
    authTypes: AUTH_TYPES,
    staffPermissions: STAFF_PERMISSIONS,
    allowedGoogleUsers: ALLOWED_GOOGLE_USERS,
    guestAllowedNames: GUEST_ALLOWED_NAMES,
    setViewerOverrideName,
    resolvePermissionsForName: resolvePermissionsForNameInternal,
    resolveGoogleAllowlistUser: resolveGoogleAllowlistUserInternal,
    signInWithGoogle,
    signInAsGuest,
    signOut,
  };

  return <AuthFrameworkContext.Provider value={value}>{children}</AuthFrameworkContext.Provider>;
}

export function useAuthFramework() {
  const context = useContext(AuthFrameworkContext);
  if (!context) throw new Error('useAuthFramework must be used within AuthFrameworkProvider.');
  return context;
}
