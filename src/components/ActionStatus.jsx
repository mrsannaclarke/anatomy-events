import { AlertTriangle, CheckCircle2, Info, LoaderCircle } from 'lucide-react';

function inferTone(message) {
  const value = String(message || '').toLowerCase();
  if (/saving|uploading|copying|generating|queueing|checking|looking up|running|deleting/.test(value)) return 'progress';
  if (/failed|could not|unable|error|required|choose|enter|select .* before|needs attention/.test(value)) return 'error';
  if (/saved|generated|copied|updated|created|deleted|received|linked|imported/.test(value)) return 'success';
  return 'info';
}

const ICONS = {
  error: AlertTriangle,
  info: Info,
  progress: LoaderCircle,
  success: CheckCircle2,
};

export function ActionStatus({ children, tone }) {
  if (!children) return null;
  const resolvedTone = tone || inferTone(children);
  const Icon = ICONS[resolvedTone];

  return (
    <div
      className={`action-status action-status--${resolvedTone}`}
      role={resolvedTone === 'error' ? 'alert' : 'status'}
      aria-live={resolvedTone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={18} className={resolvedTone === 'progress' ? 'is-spinning' : ''} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
