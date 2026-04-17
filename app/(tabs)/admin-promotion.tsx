import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { isAdminPromotionDisabledForUser } from '@/constants/admin-capabilities';
import type { AuthType } from '@/constants/auth-permissions';
import { useAuthFramework } from '@/lib/auth-framework';

type GroupedAllowlistRow = {
  displayName: string;
  emails: string[];
  effectiveAuthType: AuthType;
  promotableEmails: string[];
  promotedEmails: string[];
};

function authTypeRank(authType: AuthType): number {
  if (authType === 'super_admin') return 3;
  if (authType === 'admin') return 2;
  if (authType === 'artist') return 1;
  return 0;
}

export default function AdminPromotionScreen() {
  const router = useRouter();
  const {
    effectiveAuthType,
    user,
    canAccessAdminToolsForViewer,
    allowedGoogleUsers,
    getEffectiveAuthTypeForEmail,
    promotedAdminEmails,
    setAdminPromotion,
  } =
    useAuthFramework();
  const [promotionStatus, setPromotionStatus] = useState('');

  const canViewAdmin = canAccessAdminToolsForViewer;
  const promotionDisabledForCurrentLogin = isAdminPromotionDisabledForUser(user);
  const canPromoteAdmins =
    !promotionDisabledForCurrentLogin && (effectiveAuthType === 'super_admin' || effectiveAuthType === 'admin');
  const canDemoteAdmins = !promotionDisabledForCurrentLogin && effectiveAuthType === 'super_admin';

  const allowlistRows = useMemo(() => {
    const grouped = new Map<string, GroupedAllowlistRow>();

    allowedGoogleUsers.forEach((entry) => {
      const email = entry.email.trim().toLowerCase();
      const displayName = entry.displayName.trim() || entry.email;
      const key = displayName.toLowerCase();
      const effectiveAuthType = (getEffectiveAuthTypeForEmail(entry.email) || entry.authType) as AuthType;
      const isPromoted = promotedAdminEmails.includes(email);
      const canBePromoted = entry.authType !== 'super_admin' && entry.authType !== 'admin';

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          displayName,
          emails: [entry.email],
          effectiveAuthType,
          promotableEmails: canBePromoted ? [entry.email] : [],
          promotedEmails: isPromoted ? [entry.email] : [],
        });
        return;
      }

      if (!existing.emails.includes(entry.email)) existing.emails.push(entry.email);
      if (canBePromoted && !existing.promotableEmails.includes(entry.email)) existing.promotableEmails.push(entry.email);
      if (isPromoted && !existing.promotedEmails.includes(entry.email)) existing.promotedEmails.push(entry.email);
      if (authTypeRank(effectiveAuthType) > authTypeRank(existing.effectiveAuthType)) {
        existing.effectiveAuthType = effectiveAuthType;
      }
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        emails: [...row.emails].sort((a, b) => a.localeCompare(b)),
        promotableEmails: [...row.promotableEmails].sort((a, b) => a.localeCompare(b)),
        promotedEmails: [...row.promotedEmails].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [allowedGoogleUsers, getEffectiveAuthTypeForEmail, promotedAdminEmails]);

  function goToAdminTools() {
    router.replace('/admin');
  }

  async function handlePromoteToAdmin(displayName: string, emails: string[]) {
    if (emails.length === 0) return;
    setPromotionStatus('');
    await Promise.all(emails.map((email) => setAdminPromotion(email, true)));
    setPromotionStatus(`Promoted ${displayName} to admin (${emails.length} login${emails.length === 1 ? '' : 's'}).`);
  }

  async function handleRemoveAdminPromotion(displayName: string, emails: string[]) {
    if (emails.length === 0) return;
    setPromotionStatus('');
    await Promise.all(emails.map((email) => setAdminPromotion(email, false)));
    setPromotionStatus(
      `Removed admin promotion override for ${displayName} (${emails.length} login${emails.length === 1 ? '' : 's'}).`,
    );
  }

  if (!canViewAdmin) {
    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Admin Promotion</ThemedText>
          <ThemedText style={styles.helperText}>This page is only visible to admins and super admins.</ThemedText>
          <Pressable style={styles.secondaryButton} onPress={goToAdminTools}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="arrow-back" size={16} color="#c7d8eb" />
              <ThemedText style={styles.secondaryButtonText}>Back</ThemedText>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Pressable style={styles.secondaryButton} onPress={goToAdminTools}>
          <View style={styles.buttonContent}>
            <MaterialIcons name="arrow-back" size={16} color="#c7d8eb" />
            <ThemedText style={styles.secondaryButtonText}>Back to Admin Tools</ThemedText>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Admin Promotion</ThemedText>
        <ThemedText style={styles.helperText}>
          Admins can promote staff to admin. Only super admins can remove admin promotions.
        </ThemedText>
        {promotionDisabledForCurrentLogin ? (
          <ThemedText style={styles.helperText}>Admin promotion actions are disabled for this login.</ThemedText>
        ) : null}
        <View style={styles.rowList}>
          {allowlistRows.map((row) => {
            const isSuperAdmin = row.effectiveAuthType === 'super_admin';
            const isAdmin = row.effectiveAuthType === 'admin';
            const roleLabel = isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Staff';
            return (
              <View key={row.displayName} style={styles.userRow}>
                <View style={styles.userMeta}>
                  <ThemedText style={styles.userName}>{row.displayName}</ThemedText>
                  <ThemedText style={styles.userEmail}>{row.emails.join(' • ')}</ThemedText>
                </View>
                <View style={styles.userActionRow}>
                  <View style={[styles.roleChip, isSuperAdmin ? styles.roleChipSuper : isAdmin ? styles.roleChipAdmin : null]}>
                    <ThemedText style={styles.roleChipText}>{roleLabel}</ThemedText>
                  </View>
                  {!isSuperAdmin && !isAdmin && row.promotableEmails.length > 0 && canPromoteAdmins ? (
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => void handlePromoteToAdmin(row.displayName, row.promotableEmails)}>
                      <ThemedText style={styles.smallButtonText}>Promote</ThemedText>
                    </Pressable>
                  ) : null}
                  {!isSuperAdmin && isAdmin && row.promotedEmails.length > 0 && canDemoteAdmins ? (
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => void handleRemoveAdminPromotion(row.displayName, row.promotedEmails)}>
                      <ThemedText style={styles.smallButtonText}>Remove</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        {promotionStatus ? <ThemedText style={styles.helperText}>{promotionStatus}</ThemedText> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#e4edf8',
    fontSize: 17,
  },
  helperText: {
    color: '#9ab0c7',
    lineHeight: 18,
  },
  rowList: {
    gap: 8,
  },
  userRow: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  userMeta: {
    gap: 2,
  },
  userName: {
    color: '#e4edf8',
    fontWeight: '700',
  },
  userEmail: {
    color: '#9ab0c7',
    fontSize: 12,
  },
  userActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: '#34506b',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#152638',
  },
  roleChipAdmin: {
    borderColor: '#3f7f58',
    backgroundColor: '#123122',
  },
  roleChipSuper: {
    borderColor: '#7b5bb7',
    backgroundColor: '#241a38',
  },
  roleChipText: {
    color: '#d7e5f6',
    fontSize: 11,
    fontWeight: '700',
  },
  smallButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#172230',
  },
  smallButtonText: {
    color: '#c7d8eb',
    fontWeight: '700',
    fontSize: 12,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#172230',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: {
    color: '#c7d8eb',
    fontWeight: '700',
  },
});
