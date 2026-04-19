import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { isPayoutDisabledForUser } from '@/constants/admin-capabilities';
import { useAuthFramework } from '@/lib/auth-framework';

const EVENT_DETAILS_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1iT9aWn43FgKPKersRoj6LedLmrRCadtg3QrGL0joshs/edit?gid=1068094455#gid=1068094455';

export default function AdminScreen() {
  const router = useRouter();
  const { user, canAccessAdminTools } = useAuthFramework();
  const [adminStatus, setAdminStatus] = useState('');

  const canViewAdmin = canAccessAdminTools;
  const canOpenPayoutLedger = !isPayoutDisabledForUser(user);

  function openEventDetailsSheet() {
    setAdminStatus('');
    void Linking.openURL(EVENT_DETAILS_SHEET_URL);
  }

  function openAuditLogPage() {
    setAdminStatus('');
    router.push('/audit-log');
  }

  function openAdminPromotionPage() {
    setAdminStatus('');
    router.push('/admin-promotion');
  }

  function openPayoutLedgerPage() {
    setAdminStatus('');
    router.push('/shop-profit');
  }

  if (!canViewAdmin) {
    return (
      <View style={styles.page}>
        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Admin</ThemedText>
          <ThemedText style={styles.helperText}>This page is only visible to admins and super admins.</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>Admin Tools</ThemedText>

        <View style={styles.buttonColumn}>
          <Pressable style={styles.primaryButton} onPress={openEventDetailsSheet}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="table-view" size={16} color="#fff" />
              <ThemedText style={styles.primaryButtonText}>Open Anatomy Event App gSheet</ThemedText>
            </View>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={openAuditLogPage}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="history" size={16} color="#c7d8eb" />
              <ThemedText style={styles.secondaryButtonText}>Open Audit Log</ThemedText>
            </View>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={openAdminPromotionPage}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="manage-accounts" size={16} color="#c7d8eb" />
              <ThemedText style={styles.secondaryButtonText}>Open Admin Promotion</ThemedText>
            </View>
          </Pressable>

          {canOpenPayoutLedger ? (
            <Pressable style={styles.secondaryButton} onPress={openPayoutLedgerPage}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="payments" size={16} color="#c7d8eb" />
                <ThemedText style={styles.secondaryButtonText}>Open Payout Ledger</ThemedText>
              </View>
            </Pressable>
          ) : null}
        </View>

        {adminStatus ? <ThemedText style={styles.helperText}>{adminStatus}</ThemedText> : null}
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
  buttonColumn: {
    gap: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  primaryButton: {
    backgroundColor: '#2b74d9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#172230',
  },
  secondaryButtonText: {
    color: '#c7d8eb',
    fontWeight: '700',
  },
});
