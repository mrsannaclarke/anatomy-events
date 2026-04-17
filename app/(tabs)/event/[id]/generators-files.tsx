import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GlowPressable as Pressable } from '@/components/ui/glow-pressable';
import { SHEET_SYNC_CONFIG } from '@/constants/sheets-sync';
import { useEvents } from '@/context/events-context';
import { useAuthFramework } from '@/lib/auth-framework';
import {
  pullEventByEntryId,
  pullGeneratedDocUrlsByEntryId,
  triggerEventDocumentGeneration,
  uploadEventArtImageToSheet,
  upsertEventToSheet,
} from '@/lib/sheets-sync';

type DocumentKind = 'contract' | 'tfl';
const LICENSE_EMAIL_TO = 'hlo.applications@odhsoha.oregon.gov';
const ART_IMAGE_NOTE_PREFIX = 'ART_IMAGE_URL=';

type EventTypeVisual = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
};

function getEventTypeVisual(eventType: string): EventTypeVisual {
  const normalized = eventType.trim().toLowerCase();
  if (normalized.includes('private')) return { icon: 'celebration', color: '#b58bff' };
  if (normalized.includes('corporate')) return { icon: 'business-center', color: '#6ab7ff' };
  if (normalized.includes('wedding')) return { icon: 'favorite', color: '#ff7fb8' };
  if (normalized.includes('fundraiser')) return { icon: 'volunteer-activism', color: '#7fd29a' };
  return { icon: 'event-note', color: '#f1b56f' };
}

function asUrl(value: string): string {
  const normalized = String(value || '').trim();
  return /^https?:\/\//i.test(normalized) ? normalized : '';
}

function buildLicenseEmailSubject(clientName: string, eventType: string): string {
  const safeClientName = clientName.trim() || 'Client';
  const safeEventType = eventType.trim() || 'Event';
  return `${safeClientName} Anatomy Tattoo ${safeEventType}`;
}

function buildLicenseEmailBody(input: {
  eventAddress: string;
  eventDate: string;
  licenseUrl: string;
}): string {
  const lines = [
    `Event Address: ${input.eventAddress.trim() || 'N/A'}`,
    `Event Date: ${input.eventDate.trim() || 'N/A'}`,
  ];
  if (input.licenseUrl.trim()) {
    lines.push(`License Application: ${input.licenseUrl.trim()}`);
  }
  return lines.join('\n');
}

function buildContractEmailSubject(clientName: string, eventType: string, eventDate: string): string {
  const safeClientName = clientName.trim() || 'Client';
  const safeEventType = eventType.trim() || 'Event';
  const safeDate = eventDate.trim() || 'Event Date';
  return `${safeClientName} ${safeEventType} ${safeDate} Contract`;
}

function buildContractEmailBody(input: {
  clientName: string;
  eventType: string;
  eventDate: string;
  contractUrl: string;
}): string {
  const eventType = input.eventType.trim() || 'event';
  const eventDate = input.eventDate.trim() || 'your event date';
  const lines: string[] = [
    `Hi ${input.clientName.trim() || 'there'},`,
    '',
    `Thank you for choosing Anatomy Tattoo for your ${eventType} on ${eventDate}.`,
    "We're grateful to be included in your event and we're looking forward to working with you.",
    '',
    'Your contract is attached below:',
  ];

  if (input.contractUrl.trim()) {
    lines.push(`Contract: ${input.contractUrl.trim()}`);
  }

  lines.push('');
  lines.push('Best regards,');
  lines.push('Anatomy Tattoo');
  return lines.join('\n');
}

function buildArtEmailSubject(clientName: string, eventType: string, eventDate: string): string {
  const safeClientName = clientName.trim() || 'Client';
  const safeEventType = eventType.trim() || 'Event';
  const safeDate = eventDate.trim() || 'Event Date';
  return `${safeClientName} ${safeEventType} ${safeDate} Uploaded Art`;
}

function buildArtEmailBody(input: {
  clientName: string;
  eventType: string;
  eventDate: string;
  artUrl: string;
}): string {
  const eventType = input.eventType.trim() || 'event';
  const eventDate = input.eventDate.trim() || 'your event date';
  const lines: string[] = [
    `Hi ${input.clientName.trim() || 'there'},`,
    '',
    `Attached is your uploaded art for the ${eventType} on ${eventDate}.`,
  ];
  if (input.artUrl.trim()) {
    lines.push(`Art Link: ${input.artUrl.trim()}`);
  }
  lines.push('');
  lines.push('Best regards,');
  lines.push('Anatomy Tattoo');
  return lines.join('\n');
}

function extractDriveFileId(url: string): string {
  const normalized = url.trim();
  if (!normalized) return '';

  const fileMatch = normalized.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch && fileMatch[1]) return fileMatch[1];

  const queryMatch = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) return queryMatch[1];

  return '';
}

function extensionFromUrl(url: string): string {
  const normalized = url.trim();
  if (!normalized) return 'jpg';
  const sanitized = normalized.split('?')[0].split('#')[0];
  const match = sanitized.match(/\.([a-zA-Z0-9]+)$/);
  if (!match || !match[1]) return 'jpg';
  return match[1].toLowerCase();
}

function toRenderableImageUrl(url: string): string {
  const normalized = asUrl(url);
  if (!normalized) return '';
  const driveId = extractDriveFileId(normalized);
  if (!driveId) return normalized;
  return `https://drive.google.com/uc?export=view&id=${driveId}`;
}

function readArtImageUrlFromNotes(notes: string): string {
  const lines = String(notes || '')
    .split('\n')
    .map((line) => line.trim());
  const tokenLine = lines.find((line) => line.startsWith(ART_IMAGE_NOTE_PREFIX));
  if (!tokenLine) return '';
  return asUrl(tokenLine.slice(ART_IMAGE_NOTE_PREFIX.length).trim());
}

function writeArtImageUrlToNotes(existingNotes: string, artImageUrl: string): string {
  const lines = String(existingNotes || '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(ART_IMAGE_NOTE_PREFIX));

  const normalizedArtUrl = asUrl(artImageUrl);
  if (normalizedArtUrl) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(`${ART_IMAGE_NOTE_PREFIX}${normalizedArtUrl}`);
  }

  return lines.join('\n').trimEnd();
}

export default function EventGeneratorsFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { events, setSelectedEventId, updateEvent, upsertEventFromRemote } = useEvents();
  const { canAccessAdminToolsForViewer } = useAuthFramework();

  const [isGenerating, setIsGenerating] = useState<DocumentKind | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const [generatedContractUrl, setGeneratedContractUrl] = useState('');
  const [generatedTflUrl, setGeneratedTflUrl] = useState('');
  const [artImageUrlInput, setArtImageUrlInput] = useState('');
  const [artStatus, setArtStatus] = useState('');
  const [artError, setArtError] = useState('');
  const [isSavingArt, setIsSavingArt] = useState(false);
  const [isUploadingArt, setIsUploadingArt] = useState(false);
  const [actionFeedbackKey, setActionFeedbackKey] = useState<string | null>(null);
  const actionFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const event = events.find((item) => item.id === id);

  useEffect(() => {
    const targetEvent = event;
    if (!targetEvent) return;
    setGeneratedContractUrl(asUrl(targetEvent.contractUrl || ''));
    setGeneratedTflUrl(asUrl(targetEvent.tflUrl || ''));
    const savedArtImageUrl = asUrl(targetEvent.artImageUrl || readArtImageUrlFromNotes(targetEvent.contractNotes || ''));
    setArtImageUrlInput(savedArtImageUrl);
    setArtStatus('');
    setArtError('');
  }, [event]);

  useEffect(() => {
    const targetEvent = event;
    if (!targetEvent) return;
    const entryId = targetEvent.entryId.trim();
    if (!entryId) return;

    let isMounted = true;
    async function loadGeneratedLinksFromSheet() {
      try {
        setLoadStatus('Checking generated files...');
        let contractUrl = '';
        let tflUrl = '';
        let savedArtImageUrl = '';

        const pulledEvent = await pullEventByEntryId(SHEET_SYNC_CONFIG, entryId);
        if (pulledEvent) {
          contractUrl = asUrl(pulledEvent.contractUrl || '');
          tflUrl = asUrl(pulledEvent.tflUrl || '');
          savedArtImageUrl = asUrl(
            pulledEvent.artImageUrl || readArtImageUrlFromNotes(pulledEvent.contractNotes || ''),
          );
        }

        if (!contractUrl || !tflUrl) {
          const urls = await pullGeneratedDocUrlsByEntryId(SHEET_SYNC_CONFIG, entryId);
          if (urls) {
            if (!contractUrl) contractUrl = urls.contractUrl.trim();
            if (!tflUrl) tflUrl = urls.tflUrl.trim();
          }
        }
        if (!isMounted) return;

        if (contractUrl) {
          setGeneratedContractUrl(contractUrl);
          if (contractUrl !== (targetEvent!.contractUrl || '').trim()) {
            setSelectedEventId(targetEvent!.id);
            updateEvent(targetEvent!.id, { contractUrl });
          }
        }

        if (tflUrl) {
          setGeneratedTflUrl(tflUrl);
          if (tflUrl !== (targetEvent!.tflUrl || '').trim()) {
            setSelectedEventId(targetEvent!.id);
            updateEvent(targetEvent!.id, { tflUrl });
          }
        }

        if (savedArtImageUrl) {
          setArtImageUrlInput(savedArtImageUrl);
          if (savedArtImageUrl !== asUrl(targetEvent!.artImageUrl || '')) {
            setSelectedEventId(targetEvent!.id);
            updateEvent(targetEvent!.id, { artImageUrl: savedArtImageUrl });
          }
        }

        setLoadStatus('');
      } catch {
        if (!isMounted) return;
        setLoadStatus('');
      }
    }

    void loadGeneratedLinksFromSheet();
    return () => {
      isMounted = false;
    };
  }, [event, setSelectedEventId, updateEvent]);

  const latestContractUrl = useMemo(() => generatedContractUrl.trim(), [generatedContractUrl]);
  const latestTflUrl = useMemo(() => generatedTflUrl.trim(), [generatedTflUrl]);
  const artImageUrl = useMemo(() => asUrl(artImageUrlInput), [artImageUrlInput]);
  const artImagePreviewUrl = useMemo(() => toRenderableImageUrl(artImageUrl), [artImageUrl]);
  const contractGenerated = Boolean(latestContractUrl);
  const tflGenerated = Boolean(latestTflUrl);
  const generatorsLocked = contractGenerated && tflGenerated;
  const canViewGeneratedFiles = canAccessAdminToolsForViewer;
  const canUseAdvancedArtActions = canAccessAdminToolsForViewer;

  function showActionFeedback(actionKey: string) {
    setActionFeedbackKey(actionKey);
    if (actionFeedbackTimeoutRef.current) {
      clearTimeout(actionFeedbackTimeoutRef.current);
    }
    actionFeedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedbackKey((current) => (current === actionKey ? null : current));
      actionFeedbackTimeoutRef.current = null;
    }, 260);
  }

  useEffect(
    () => () => {
      if (actionFeedbackTimeoutRef.current) {
        clearTimeout(actionFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  if (!event) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="subtitle">Event not found</ThemedText>
      </View>
    );
  }

  const currentEvent = event;
  const typeVisual = getEventTypeVisual(currentEvent.eventType);

  async function handleGenerate(kind: DocumentKind) {
    const entryId = currentEvent.entryId.trim();
    if (!entryId) {
      setErrorMessage('Save this event to sheet first so generation can target a valid Entry ID.');
      return;
    }

    setIsGenerating(kind);
    setErrorMessage('');
    try {
      const generated = await triggerEventDocumentGeneration(SHEET_SYNC_CONFIG, { entryId, kind });
      const contractUrl = asUrl(generated.contractUrl);
      const tflUrl = asUrl(generated.tflUrl);

      if (contractUrl) {
        setGeneratedContractUrl(contractUrl);
        setSelectedEventId(currentEvent.id);
        updateEvent(currentEvent.id, { contractUrl });
      }
      if (tflUrl) {
        setGeneratedTflUrl(tflUrl);
        setSelectedEventId(currentEvent.id);
        updateEvent(currentEvent.id, { tflUrl });
      }

      const urlToOpen = kind === 'contract' ? contractUrl : tflUrl;
      if (urlToOpen) {
        await Linking.openURL(urlToOpen);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate file.');
    } finally {
      setIsGenerating(null);
    }
  }

  async function handleEmailLicenseApplication() {
    const subject = buildLicenseEmailSubject(currentEvent.clientName, currentEvent.eventType);
    const body = buildLicenseEmailBody({
      eventAddress: currentEvent.eventAddress,
      eventDate: currentEvent.eventDate,
      licenseUrl: latestTflUrl,
    });

    const mailtoUrl = `mailto:${LICENSE_EMAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      setErrorMessage('Unable to open your email app.');
    }
  }

  async function handleEmailContractToClient() {
    const toEmail = currentEvent.email.trim();
    if (!toEmail) {
      setErrorMessage('Client email is missing on this event.');
      return;
    }
    if (!latestContractUrl) {
      setErrorMessage('No contract is available to email.');
      return;
    }

    const subject = buildContractEmailSubject(currentEvent.clientName, currentEvent.eventType, currentEvent.eventDate);
    const body = buildContractEmailBody({
      clientName: currentEvent.clientName,
      eventType: currentEvent.eventType,
      eventDate: currentEvent.eventDate,
      contractUrl: latestContractUrl,
    });
    const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      setErrorMessage('Unable to open your email app.');
    }
  }

  async function handleCopyContractEmailToClipboard() {
    const toEmail = currentEvent.email.trim();
    if (!toEmail) {
      setErrorMessage('Client email is missing on this event.');
      return;
    }
    try {
      await Clipboard.setStringAsync(toEmail);
      setErrorMessage('');
    } catch {
      setErrorMessage('Unable to copy client email.');
    }
  }

  async function handleCopyLicenseEmailToClipboard() {
    try {
      await Clipboard.setStringAsync(LICENSE_EMAIL_TO);
      setErrorMessage('');
    } catch {
      setErrorMessage('Unable to copy licensing email.');
    }
  }

  async function persistArtImage(nextArtUrl: string) {
    const entryId = currentEvent.entryId.trim();
    if (!entryId) {
      setArtError('Save this event to sheet first so art can be stored.');
      setArtStatus('');
      return;
    }

    const nextContractNotes = writeArtImageUrlToNotes(currentEvent.contractNotes || '', nextArtUrl);
    setIsSavingArt(true);
    setArtError('');
    setArtStatus('Saving art image...');
    try {
      setSelectedEventId(currentEvent.id);
      updateEvent(currentEvent.id, { contractNotes: nextContractNotes, artImageUrl: nextArtUrl });

      const latestEvent = events.find((item) => item.id === currentEvent.id) || currentEvent;
      const saved = await upsertEventToSheet(SHEET_SYNC_CONFIG, {
        ...latestEvent,
        contractNotes: nextContractNotes,
        artImageUrl: nextArtUrl,
      });
      const pulled = await pullEventByEntryId(SHEET_SYNC_CONFIG, saved.entryId || entryId);
      if (pulled) {
        upsertEventFromRemote(pulled);
      }
      setArtStatus(nextArtUrl ? 'Art image saved.' : 'Art image removed.');
    } catch (error) {
      setArtStatus('');
      setArtError(error instanceof Error ? error.message : 'Unable to save art image.');
    } finally {
      setIsSavingArt(false);
    }
  }

  async function handleSaveArtImage() {
    const trimmedInput = artImageUrlInput.trim();
    if (trimmedInput && !artImageUrl) {
      setArtError('Enter a valid public image URL (https://...).');
      setArtStatus('');
      return;
    }
    await persistArtImage(artImageUrl);
  }

  async function handleDeleteSavedArt() {
    setArtImageUrlInput('');
    await persistArtImage('');
  }

  function confirmDeleteSavedArt() {
    if (!artImageUrl) return;

    if (Platform.OS === 'web') {
      const browserApi = globalThis as unknown as { confirm?: (message?: string) => boolean };
      const confirmed = browserApi.confirm
        ? browserApi.confirm('Delete saved art for this event? This cannot be undone.')
        : true;
      if (confirmed) {
        void handleDeleteSavedArt();
      }
      return;
    }

    Alert.alert(
      'Delete Saved Art?',
      'This will remove the saved art for this event.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDeleteSavedArt();
          },
        },
      ],
      { cancelable: true },
    );
  }

  async function handleEmailArtToClient() {
    const toEmail = currentEvent.email.trim();
    if (!toEmail) {
      setArtError('Client email is missing on this event.');
      return;
    }
    if (!artImageUrl) {
      setArtError('No art image is available to email.');
      return;
    }

    const subject = buildArtEmailSubject(currentEvent.clientName, currentEvent.eventType, currentEvent.eventDate);
    const body = buildArtEmailBody({
      clientName: currentEvent.clientName,
      eventType: currentEvent.eventType,
      eventDate: currentEvent.eventDate,
      artUrl: artImageUrl,
    });
    const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(mailtoUrl);
      setArtError('');
    } catch {
      setArtError('Unable to open your email app.');
    }
  }

  async function handleShareArtLink() {
    if (!artImageUrl) {
      setArtError('No art image is available to share.');
      return;
    }

    try {
      await Share.share({ message: artImageUrl, url: artImageUrl });
      setArtError('');
    } catch {
      setArtError('Unable to share art link.');
    }
  }

  async function handleUploadArtFromDevice() {
    const entryId = currentEvent.entryId.trim();
    if (!entryId) {
      setArtError('Save this event to sheet first so art can be uploaded.');
      setArtStatus('');
      return;
    }

    setArtError('');
    setArtStatus('');
    setIsUploadingArt(true);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setArtError('Photo library access is required to upload art.');
          return;
        }
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset) return;

      const base64Data = String(asset.base64 || '').trim();
      if (!base64Data) {
        setArtError('Unable to read selected image. Try another image.');
        return;
      }

      const mimeType = String(asset.mimeType || 'image/jpeg');
      const fileName =
        String(asset.fileName || '').trim() ||
        `art-${entryId}-${Date.now()}.${mimeType.includes('png') ? 'png' : 'jpg'}`;

      setArtStatus('Uploading art image...');
      const uploadedEvent = await uploadEventArtImageToSheet(SHEET_SYNC_CONFIG, {
        entryId,
        base64Data,
        mimeType,
        fileName,
      });
      upsertEventFromRemote(uploadedEvent);
      const nextArtUrl = asUrl(
        uploadedEvent.artImageUrl || readArtImageUrlFromNotes(uploadedEvent.contractNotes || ''),
      );
      if (nextArtUrl) setArtImageUrlInput(nextArtUrl);
      setArtStatus('Art image uploaded.');
    } catch (error) {
      setArtStatus('');
      setArtError(error instanceof Error ? error.message : 'Unable to upload art image.');
    } finally {
      setIsUploadingArt(false);
    }
  }

  async function handleDownloadArtToDevice() {
    if (!artImageUrl) {
      setArtError('No art image is available to download.');
      setArtStatus('');
      return;
    }

    setArtError('');
    setArtStatus('Preparing art download...');
    try {
      if (Platform.OS === 'web') {
        try {
          const response = await fetch(artImageUrl);
          if (!response.ok) throw new Error(`Download failed (${response.status}).`);
          const blob = await response.blob();
          const browserApi = globalThis as unknown as {
            URL?: { createObjectURL?: (blobValue: any) => string; revokeObjectURL?: (value: string) => void };
            document?: { createElement?: (tagName: string) => any; body?: { appendChild?: (node: any) => void } };
          };
          const objectUrl = browserApi.URL?.createObjectURL ? browserApi.URL.createObjectURL(blob) : '';
          const anchor = browserApi.document?.createElement ? browserApi.document.createElement('a') : null;
          if (!objectUrl || !anchor) throw new Error('Browser download API unavailable.');
          anchor.href = objectUrl;
          anchor.download = `event-art-${currentEvent.entryId || 'client'}.${extensionFromUrl(artImageUrl)}`;
          browserApi.document?.body?.appendChild?.(anchor);
          anchor.click();
          anchor.remove();
          browserApi.URL?.revokeObjectURL?.(objectUrl);
          setArtStatus('Art download started.');
          return;
        } catch {
          await Linking.openURL(artImageUrl);
          setArtStatus('Opened art link. Use browser save/download.');
          return;
        }
      }

      const ext = extensionFromUrl(artImageUrl);
      const fileName = `event-art-${currentEvent.entryId || 'client'}-${Date.now()}.${ext}`;
      const targetFile = new File(Paths.cache, fileName);
      const downloadedFile = await File.downloadFileAsync(artImageUrl, targetFile, { idempotent: true });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadedFile.uri, {
          dialogTitle: 'Save Art',
          mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });
        setArtStatus('Art downloaded. Use share sheet to save to device.');
      } else {
        await Linking.openURL(downloadedFile.uri);
        setArtStatus('Art downloaded.');
      }
    } catch (error) {
      setArtStatus('');
      setArtError(error instanceof Error ? error.message : 'Unable to download art image.');
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          style={[styles.backButton, actionFeedbackKey === 'back' ? styles.pressableGlow : null]}
          onPress={() => {
            showActionFeedback('back');
            router.back();
          }}>
          <MaterialIcons name="arrow-back" size={14} color="#cde0f5" />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          <View style={[styles.eventTypeIconWrap, { borderColor: typeVisual.color }]}>
            <MaterialIcons name={typeVisual.icon} size={15} color={typeVisual.color} />
          </View>
          <ThemedText type="title" style={[styles.heroTitle, { color: typeVisual.color }]}>
            {currentEvent.clientName || 'Untitled Event'}
          </ThemedText>
        </View>
      </View>

      {canViewGeneratedFiles && !generatorsLocked ? (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Generators</ThemedText>
          <View style={styles.buttonRow}>
            {!contractGenerated ? (
              <Pressable
                style={[
                  styles.actionButton,
                  styles.contractActionButton,
                  actionFeedbackKey === 'generate_contract' ? styles.pressableGlow : null,
                  isGenerating != null ? styles.actionButtonDisabled : null,
                ]}
                onPress={() => {
                  showActionFeedback('generate_contract');
                  void handleGenerate('contract');
                }}
                disabled={isGenerating != null}>
                <MaterialIcons name="description" size={14} color="#d9e9ff" />
                <ThemedText style={styles.actionButtonText}>
                  {isGenerating === 'contract' ? 'Generating Contract...' : 'Generate Contract'}
                </ThemedText>
              </Pressable>
            ) : null}
            {!tflGenerated ? (
              <Pressable
                style={[
                  styles.actionButton,
                  styles.licenseActionButton,
                  actionFeedbackKey === 'generate_license' ? styles.pressableGlow : null,
                  isGenerating != null ? styles.actionButtonDisabled : null,
                ]}
                onPress={() => {
                  showActionFeedback('generate_license');
                  void handleGenerate('tfl');
                }}
                disabled={isGenerating != null}>
                <MaterialIcons name="badge" size={14} color="#d7f7e5" />
                <ThemedText style={styles.actionButtonText}>
                  {isGenerating === 'tfl' ? 'Generating License...' : 'Generate License'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Generated Forms</ThemedText>
        {canViewGeneratedFiles ? (
          <>
            {latestContractUrl ? (
              <Pressable
                style={[
                  styles.linkButton,
                  styles.contractLinkButton,
                  actionFeedbackKey === 'open_contract' ? styles.pressableGlow : null,
                ]}
                onPress={() => {
                  showActionFeedback('open_contract');
                  void Linking.openURL(latestContractUrl);
                }}>
                <MaterialIcons name="open-in-new" size={13} color="#bfe1ff" />
                <ThemedText style={[styles.linkText, styles.contractLinkText]}>Open Event Contract</ThemedText>
              </Pressable>
            ) : null}
            {latestContractUrl ? (
              <Pressable
                style={[
                  styles.linkButton,
                  styles.contractLinkButton,
                  actionFeedbackKey === 'email_contract' ? styles.pressableGlow : null,
                ]}
                onPress={() => {
                  showActionFeedback('email_contract');
                  void handleEmailContractToClient();
                }}>
                <MaterialIcons name="mail-outline" size={13} color="#bfe1ff" />
                <ThemedText style={[styles.linkText, styles.contractLinkText]}>Email Contract to Client</ThemedText>
              </Pressable>
            ) : null}
          </>
        ) : null}
        <Pressable
          style={[
            styles.linkButton,
            styles.contractLinkButton,
            actionFeedbackKey === 'copy_contract_email' ? styles.pressableGlow : null,
          ]}
          onPress={() => {
            showActionFeedback('copy_contract_email');
            void handleCopyContractEmailToClipboard();
          }}>
          <MaterialIcons name="content-copy" size={13} color="#bfe1ff" />
          <ThemedText style={[styles.linkText, styles.contractLinkText]}>Copy Email to Clipboard</ThemedText>
        </Pressable>
        {canViewGeneratedFiles ? (
          <>
            {latestTflUrl ? (
              <Pressable
                style={[
                  styles.linkButton,
                  styles.licenseLinkButton,
                  actionFeedbackKey === 'open_license' ? styles.pressableGlow : null,
                ]}
                onPress={() => {
                  showActionFeedback('open_license');
                  void Linking.openURL(latestTflUrl);
                }}>
                <MaterialIcons name="open-in-new" size={13} color="#d7f7e5" />
                <ThemedText style={[styles.linkText, styles.licenseLinkText]}>Open License Application</ThemedText>
              </Pressable>
            ) : null}
            {latestTflUrl ? (
              <Pressable
                style={[
                  styles.linkButton,
                  styles.licenseLinkButton,
                  actionFeedbackKey === 'email_license' ? styles.pressableGlow : null,
                ]}
                onPress={() => {
                  showActionFeedback('email_license');
                  void handleEmailLicenseApplication();
                }}>
                <MaterialIcons name="mail-outline" size={13} color="#d7f7e5" />
                <ThemedText style={[styles.linkText, styles.licenseLinkText]}>Email License Application</ThemedText>
              </Pressable>
            ) : null}
            {latestTflUrl ? (
              <Pressable
                style={[
                  styles.linkButton,
                  styles.licenseLinkButton,
                  actionFeedbackKey === 'copy_license_email' ? styles.pressableGlow : null,
                ]}
                onPress={() => {
                  showActionFeedback('copy_license_email');
                  void handleCopyLicenseEmailToClipboard();
                }}>
                <MaterialIcons name="content-copy" size={13} color="#d7f7e5" />
                <ThemedText style={[styles.linkText, styles.licenseLinkText]}>Copy Email to Clipboard</ThemedText>
              </Pressable>
            ) : null}
            {!latestContractUrl && !latestTflUrl ? (
              <ThemedText style={styles.infoText}>No generated files are linked to this event yet.</ThemedText>
            ) : null}
            {loadStatus ? <ThemedText style={styles.infoText}>{loadStatus}</ThemedText> : null}
            {errorMessage ? <ThemedText style={styles.errorText}>{errorMessage}</ThemedText> : null}
          </>
        ) : null}
        {!canViewGeneratedFiles && errorMessage ? <ThemedText style={styles.errorText}>{errorMessage}</ThemedText> : null}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Uploaded Art</ThemedText>
        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.actionButton,
              actionFeedbackKey === 'upload_art' ? styles.pressableGlow : null,
              isUploadingArt ? styles.actionButtonDisabled : null,
            ]}
            onPress={() => {
              showActionFeedback('upload_art');
              void handleUploadArtFromDevice();
            }}
            disabled={isUploadingArt}>
            <MaterialIcons name="file-upload" size={14} color="#dceafe" />
            <ThemedText style={styles.actionButtonText}>
              {isUploadingArt ? 'Uploading...' : 'Upload From Device'}
            </ThemedText>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          value={artImageUrlInput}
          onChangeText={(text) => {
            setArtImageUrlInput(text);
            if (artError) setArtError('');
            if (artStatus) setArtStatus('');
          }}
          placeholder="Paste public image URL to store with this event"
          placeholderTextColor="#6f849a"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.actionButton,
              actionFeedbackKey === 'save_art' ? styles.pressableGlow : null,
              isSavingArt || isUploadingArt ? styles.actionButtonDisabled : null,
            ]}
            onPress={() => {
              showActionFeedback('save_art');
              void handleSaveArtImage();
            }}
            disabled={isSavingArt || isUploadingArt}>
            <MaterialIcons name="save" size={14} color="#dceafe" />
            <ThemedText style={styles.actionButtonText}>{isSavingArt ? 'Saving Art...' : 'Save Art'}</ThemedText>
          </Pressable>
          {canUseAdvancedArtActions && artImageUrl ? (
            <Pressable
              style={[
                styles.actionButton,
                actionFeedbackKey === 'delete_art' ? styles.pressableGlow : null,
                isSavingArt || isUploadingArt ? styles.actionButtonDisabled : null,
              ]}
              onPress={() => {
                showActionFeedback('delete_art');
                confirmDeleteSavedArt();
              }}
              disabled={isSavingArt || isUploadingArt}>
              <MaterialIcons name="delete-outline" size={14} color="#dceafe" />
              <ThemedText style={styles.actionButtonText}>Delete Saved Art</ThemedText>
            </Pressable>
          ) : null}
          {canUseAdvancedArtActions && artImageUrl ? (
            <Pressable
              style={[styles.actionButton, actionFeedbackKey === 'open_art' ? styles.pressableGlow : null]}
              onPress={() => {
                showActionFeedback('open_art');
                void Linking.openURL(artImageUrl);
              }}>
              <MaterialIcons name="open-in-new" size={14} color="#dceafe" />
              <ThemedText style={styles.actionButtonText}>Open Art</ThemedText>
            </Pressable>
          ) : null}
          {canUseAdvancedArtActions && artImageUrl ? (
            <Pressable
              style={[styles.actionButton, actionFeedbackKey === 'email_art' ? styles.pressableGlow : null]}
              onPress={() => {
                showActionFeedback('email_art');
                void handleEmailArtToClient();
              }}>
              <MaterialIcons name="mail-outline" size={14} color="#dceafe" />
              <ThemedText style={styles.actionButtonText}>Email Art</ThemedText>
            </Pressable>
          ) : null}
          {canUseAdvancedArtActions && artImageUrl ? (
            <Pressable
              style={[styles.actionButton, actionFeedbackKey === 'share_art' ? styles.pressableGlow : null]}
              onPress={() => {
                showActionFeedback('share_art');
                void handleShareArtLink();
              }}>
              <MaterialIcons name="share" size={14} color="#dceafe" />
              <ThemedText style={styles.actionButtonText}>Share Art</ThemedText>
            </Pressable>
          ) : null}
          {canUseAdvancedArtActions && artImageUrl ? (
            <Pressable
              style={[styles.actionButton, actionFeedbackKey === 'download_art' ? styles.pressableGlow : null]}
              onPress={() => {
                showActionFeedback('download_art');
                void handleDownloadArtToDevice();
              }}>
              <MaterialIcons name="download" size={14} color="#dceafe" />
              <ThemedText style={styles.actionButtonText}>Download Art</ThemedText>
            </Pressable>
          ) : null}
        </View>
        {artStatus ? <ThemedText style={styles.infoText}>{artStatus}</ThemedText> : null}
        {artError ? <ThemedText style={styles.errorText}>{artError}</ThemedText> : null}
        {artImagePreviewUrl ? <Image source={{ uri: artImagePreviewUrl }} style={styles.artPreview} resizeMode="cover" /> : null}
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
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a3f56',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#101922',
  },
  backButtonText: {
    color: '#cde0f5',
    fontWeight: '700',
    fontSize: 12,
  },
  hero: {
    backgroundColor: '#111a24',
    borderColor: '#223244',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventTypeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#0f1620',
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223244',
    backgroundColor: '#111a24',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#e8f1fb',
    fontWeight: '700',
    fontSize: 17,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: '#2f4358',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#172230',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contractActionButton: {
    borderColor: '#3f78b4',
    backgroundColor: '#18395a',
  },
  licenseActionButton: {
    borderColor: '#3b8f63',
    backgroundColor: '#183f2c',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  pressableGlow: {
    borderColor: '#67a9ff',
    shadowColor: '#67a9ff',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  actionButtonText: {
    color: '#dceafe',
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2b3f55',
    borderRadius: 10,
    backgroundColor: '#0f1620',
    color: '#e5eef8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    color: '#ff9aa7',
    lineHeight: 18,
  },
  linkButton: {
    borderWidth: 1,
    borderColor: '#305170',
    borderRadius: 999,
    backgroundColor: '#122131',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  contractLinkButton: {
    borderColor: '#3f78b4',
    backgroundColor: '#18395a',
  },
  licenseLinkButton: {
    borderColor: '#3b8f63',
    backgroundColor: '#183f2c',
  },
  linkText: {
    color: '#9fd0ff',
    fontWeight: '700',
    fontSize: 12,
  },
  contractLinkText: {
    color: '#bfe1ff',
  },
  licenseLinkText: {
    color: '#d7f7e5',
  },
  infoText: {
    color: '#9cb1c8',
    lineHeight: 19,
  },
  artPreview: {
    width: '100%',
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f4358',
    backgroundColor: '#0f1620',
  },
});
