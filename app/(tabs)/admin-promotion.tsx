import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuthFramework } from '@/lib/auth-framework';

export default function AdminPromotionScreen() {
  const router = useRouter();
  const {
    canAccessAdminToolsForViewer,
    allowedGoogleUsers,
    getEffectiveAuthTypeForEmail,
    promotedAdminEmails,
    setAdminPromotion,
  } =
    useAuthFramework();
  const [promotionStatus, setPromotionStatus] = useState('');

  const canViewAdmin = canAccessAdminToolsForViewer;

  const allowlistRows = useMemo(() => {
    return allowedGoogleUsers
      .map((entry) => ({
        email: entry.email,
        displayName: entry.displayName,
        effectiveAuthType: getEffectiveAuthTypeForEmail(entry.email) || entry.authType,
        isPromoted: promotedAdminEmails.includes(entry.email.trim().toLowerCase()),
      }))
      .sort((a, b) => {
        if (a.displayName === b.displayName) return a.email.localeCompare(b.email);
        return a.displayName.localeCompare(b.displayName);
      });
  }, [allowedGoogleUsers, getEffectiveAuthTypeForEmail, promotedAdminEmails]);

  function goToAdminTools() {
    router.replace('/admin');
  }

  async function handlePromoteToAdmin(email: string) {
    setPromotionStatus('');
    await setAdminPromotion(email, true);
    setPromotionStatus(`Promoted ${email} to admin.`);
  }

  async function handleRemoveAdminPromotion(email: string) {
    setPromotionStatus('');
    await setAdminPromotion(email, false);
    setPromotionStatus(`Removed admin promotion override for ${email}.`);
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
          Promote allowlisted users to admin from this list. Super admins keep fixed access.
        </ThemedText>
        <View style={styles.rowList}>
          {allowlistRows.map((row) => {
            const isSuperAdmin = row.effectiveAuthType === 'super_admin';
            const isAdmin = row.effectiveAuthType === 'admin';
            const roleLabel = isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : 'Staff';
            return (
              <View key={row.email} style={styles.userRow}>
                <View style={styles.userMeta}>
                  <ThemedText style={styles.userName}>{row.displayName}</ThemedText>
                  <ThemedText style={styles.userEmail}>{row.email}</ThemedText>
                </View>
                <View style={styles.userActionRow}>
                  <View style={[styles.roleChip, isSuperAdmin ? styles.roleChipSuper : isAdmin ? styles.roleChipAdmin : null]}>
                    <ThemedText style={styles.roleChipText}>{roleLabel}</ThemedText>
                  </View>
                  {!isSuperAdmin && !isAdmin ? (
                    <Pressable style={styles.smallButton} onPress={() => void handlePromoteToAdmin(row.email)}>
                      <ThemedText style={styles.smallButtonText}>Promote</ThemedText>
                    </Pressable>
                  ) : null}
                  {!isSuperAdmin && isAdmin && row.isPromoted ? (
                    <Pressable style={styles.smallButton} onPress={() => void handleRemoveAdminPromotion(row.email)}>
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
    backgroundColor: '#0b1117',
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
