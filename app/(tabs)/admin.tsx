import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuthFramework } from '@/lib/auth-framework';

const EVENT_DETAILS_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1VMuggaK9t0dsDDMqW7Crl28_mXyA-b9vnIkB5ys2uUo/edit?gid=1325964236#gid=1325964236';

export default function AdminScreen() {
  const router = useRouter();
  const { canAccessAdminTools, viewerName, viewerOverrideName, setViewerOverrideName, staffPermissions } = useAuthFramework();
  const [adminStatus, setAdminStatus] = useState('');

  const canViewAdmin = canAccessAdminTools;
  const viewAsNames = useMemo(
    () =>
      Array.from(
        new Set(
          staffPermissions
            .filter((entry) => entry.roles.includes('artist') || entry.roles.includes('counter'))
            .map((entry) => entry.name),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [staffPermissions],
  );

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

        <View style={styles.viewAsBlock}>
          <ThemedText style={styles.viewAsLabel}>View As Profile (Testing)</ThemedText>
          <ThemedText style={styles.viewAsCurrent}>
            {viewerOverrideName ? `Active: ${viewerName}` : `Active: Account default (${viewerName || 'Unknown'})`}
          </ThemedText>
          <View style={styles.viewAsChipRow}>
            <Pressable
              style={[styles.viewAsChip, !viewerOverrideName ? styles.viewAsChipActive : null]}
              onPress={() => setViewerOverrideName(null)}>
              <ThemedText style={[styles.viewAsChipText, !viewerOverrideName ? styles.viewAsChipTextActive : null]}>
                Default
              </ThemedText>
            </Pressable>
            {viewAsNames.map((name) => {
              const selected = viewerOverrideName?.toLowerCase() === name.toLowerCase();
              return (
                <Pressable
                  key={name}
                  style={[styles.viewAsChip, selected ? styles.viewAsChipActive : null]}
                  onPress={() => setViewerOverrideName(name)}>
                  <ThemedText style={[styles.viewAsChipText, selected ? styles.viewAsChipTextActive : null]}>
                    {name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.buttonColumn}>
          <Pressable style={styles.primaryButton} onPress={openEventDetailsSheet}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="table-view" size={16} color="#fff" />
              <ThemedText style={styles.primaryButtonText}>Open Event Details gSheet</ThemedText>
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

          <Pressable style={styles.secondaryButton} onPress={openPayoutLedgerPage}>
            <View style={styles.buttonContent}>
              <MaterialIcons name="payments" size={16} color="#c7d8eb" />
              <ThemedText style={styles.secondaryButtonText}>Open Payout Ledger</ThemedText>
            </View>
          </Pressable>
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
  viewAsBlock: {
    borderWidth: 1,
    borderColor: '#2a3c50',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  viewAsLabel: {
    color: '#d6e6fa',
    fontWeight: '700',
    fontSize: 13,
  },
  viewAsCurrent: {
    color: '#9ab0c7',
    fontSize: 12,
  },
  viewAsChipRow: {
    flexDirection: 'row',
    gap: 7,
    flexWrap: 'wrap',
  },
  viewAsChip: {
    borderWidth: 1,
    borderColor: '#2d4259',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#0f1620',
  },
  viewAsChipActive: {
    borderColor: '#2b74d9',
    backgroundColor: '#2b74d9',
  },
  viewAsChipText: {
    color: '#9fb3c8',
    fontWeight: '700',
    fontSize: 12,
  },
  viewAsChipTextActive: {
    color: '#fff',
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
