export function getSheetSyncPresentation({ syncStatus, syncError, lastSyncAt, formatSyncTime }) {
  const isBusy = syncStatus === 'loading' || syncStatus === 'refreshing';
  const isUsingSavedData = syncStatus === 'connected_error' && Boolean(lastSyncAt);

  if (isBusy) {
    return { isBusy, isUsingSavedData: false, statusLabel: 'Updating Sheet data…' };
  }
  if (isUsingSavedData) {
    return { isBusy, isUsingSavedData, statusLabel: 'Using saved Sheet data' };
  }
  if (syncError) {
    return { isBusy, isUsingSavedData: false, statusLabel: 'Sheet needs attention' };
  }
  return { isBusy, isUsingSavedData: false, statusLabel: formatSyncTime(lastSyncAt) };
}
