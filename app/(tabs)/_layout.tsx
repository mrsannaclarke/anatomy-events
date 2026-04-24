import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isPayoutDisabledForUser } from '@/constants/admin-capabilities';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthFramework } from '@/lib/auth-framework';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [isRouteLoading, setIsRouteLoading] = React.useState(false);
  const {
    status,
    isHydrating,
    user,
    viewerName,
    effectiveAuthType,
    canAccessAdminToolsForViewer,
    resolvePermissionsForName,
    signInWithGoogle,
    signOut,
    errorMessage,
    config,
  } = useAuthFramework();

  React.useEffect(() => {
    setIsRouteLoading(true);
    const timeoutId = setTimeout(() => {
      setIsRouteLoading(false);
    }, 220);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pathname]);

  if (status === 'signed_out') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>Anatomy Events</Text>
        <Text style={styles.authText}>Sign in with your Google account to access the app.</Text>
        {errorMessage ? <Text style={styles.authError}>{errorMessage}</Text> : null}
        {isSigningIn ? (
          <ActivityIndicator color="#f2c066" />
        ) : (
          <Pressable
            style={[styles.googleButton, !config.enableGoogleSignIn && styles.googleButtonDisabled]}
            disabled={!config.enableGoogleSignIn}
            onPress={async () => {
              setIsSigningIn(true);
              try {
                await signInWithGoogle();
              } finally {
                setIsSigningIn(false);
              }
            }}>
            <Text style={styles.googleButtonText}>
              {config.enableGoogleSignIn ? 'Sign In With Google' : 'Google Sign-In Disabled'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (isHydrating) {
    return <AppLoadingScreen />;
  }

  const canViewAdminTab = canAccessAdminToolsForViewer;
  const canViewPricingTab = canAccessAdminToolsForViewer;
  const payoutDisabledForCurrentLogin = isPayoutDisabledForUser(user);
  const viewerPermission = viewerName ? resolvePermissionsForName(viewerName) : null;
  const canViewPayTab =
    !payoutDisabledForCurrentLogin &&
    (status === 'bypass' ||
      effectiveAuthType === 'super_admin' ||
      effectiveAuthType === 'admin' ||
      Boolean(viewerPermission?.roles.includes('artist') || viewerPermission?.roles.includes('counter')));

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          sceneStyle: {
            backgroundColor: '#0b1117',
          },
          headerStyle: {
            backgroundColor: '#0f1620',
          },
          headerTintColor: '#e3ecf8',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerRight: () => (
            <Pressable style={styles.switchUserButton} onPress={signOut}>
              <Text style={styles.switchUserButtonText}>Switch User</Text>
            </Pressable>
          ),
          tabBarStyle: {
            backgroundColor: '#0f1620',
            borderTopColor: '#1e2a38',
            height: 72,
          },
          tabBarItemStyle: {
            paddingTop: 4,
            paddingBottom: 0,
          },
          tabBarLabelStyle: {
            marginBottom: 2,
          },
          tabBarButton: HapticTab,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Events',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pricing"
          options={{
            title: 'Pricing Calculator',
            tabBarLabel: 'Pricing',
            href: canViewPricingTab ? undefined : null,
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="dollarsign" color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Generator',
            href: null,
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pay"
          options={{
            title: 'Payout',
            tabBarLabel: 'Payout',
            href: canViewPayTab ? undefined : null,
            tabBarIcon: ({ color }) => <MaterialIcons size={24} name="payments" color={String(color)} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: canViewAdminTab ? undefined : null,
            tabBarIcon: ({ color }) => (
              <IconSymbol size={28} name="person.crop.circle.badge.checkmark" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="audit-log"
          options={{
            title: 'Audit Log',
            href: null,
          }}
        />
        <Tabs.Screen
          name="completed-payouts"
          options={{
            title: 'Payout Ledger',
            href: null,
          }}
        />
        <Tabs.Screen
          name="shop-profit"
          options={{
            title: 'Payout Ledger',
            href: null,
          }}
        />
        <Tabs.Screen
          name="event/[id]"
          options={{
            title: 'Staff Assignements',
            href: null,
          }}
        />
        <Tabs.Screen
          name="event/[id]/client-details"
          options={{
            title: 'Client Details',
            href: null,
          }}
        />
        <Tabs.Screen
          name="event/[id]/notes"
          options={{
            title: 'Notes',
            href: null,
          }}
        />
        <Tabs.Screen
          name="event/[id]/generators-files"
          options={{
            title: 'Generators & Files',
            href: null,
          }}
        />
      </Tabs>
      {isRouteLoading ? (
        <View style={styles.routeLoadingOverlay} pointerEvents="auto">
          <AppLoadingScreen />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#0b1117',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  authTitle: {
    color: '#f3f6fb',
    fontSize: 30,
    fontWeight: '700',
  },
  authText: {
    color: '#d1dbe8',
    lineHeight: 22,
  },
  authError: {
    color: '#ff9db1',
    lineHeight: 22,
  },
  googleButton: {
    backgroundColor: '#f2c066',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  googleButtonDisabled: {
    backgroundColor: '#7e6943',
    opacity: 0.7,
  },
  routeLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  googleButtonText: {
    color: '#0f1620',
    fontWeight: '700',
  },
  switchUserButton: {
    backgroundColor: '#1b2633',
    borderRadius: 8,
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  switchUserButtonText: {
    color: '#e3ecf8',
    fontSize: 12,
    fontWeight: '700',
  },
});
