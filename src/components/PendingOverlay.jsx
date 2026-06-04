export function PendingOverlay({ show, label = 'Saving to Sheet...' }) {
  if (!show) return null;

  return (
    <div className="pending-overlay" role="status" aria-live="polite">
      <span className="pending-spinner" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}
