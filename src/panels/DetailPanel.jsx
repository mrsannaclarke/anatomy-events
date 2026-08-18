import { MoveLeft } from 'lucide-react';

import { cardActions } from '../constants.js';
import { isZeroWalkUpPricing } from '../pricingMath.js';
import { ClientDetailsPanel } from './ClientDetailsPanel.jsx';
import { FilesPanel } from './FilesPanel.jsx';
import { NotesPanel } from './NotesPanel.jsx';
import { StaffAssignmentsPanel } from './StaffAssignmentsPanel.jsx';

export function DetailPanel({ detail, viewerEmail, viewerName, onBack, onSaved, onDeleted, onChangeMode }) {
  if (!detail) return null;
  const { mode, event } = detail;
  const isStaffingOnly = isZeroWalkUpPricing(event);
  const availableActions = isStaffingOnly ? cardActions.filter((action) => action.id === 'staff') : cardActions;
  const effectiveMode = isStaffingOnly ? 'staff' : mode;
  const activeAction = availableActions.find((action) => action.id === effectiveMode);

  return (
    <section className="detail-panel">
      <div className="detail-page-nav client-detail-menu" aria-label={`${event.clientName} client card pages`}>
        <button type="button" className="detail-back-button" onClick={onBack} aria-label="Back to events">
          <MoveLeft size={32} strokeWidth={2.1} />
        </button>
        <div className="detail-page-client">
          <strong>{event.clientName}</strong>
          <span>{activeAction?.label || 'Client Card'}</span>
        </div>
        <div className="detail-page-actions">
          {availableActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={effectiveMode === action.id ? 'active' : ''}
              title={action.label}
              aria-label={action.label}
              aria-current={effectiveMode === action.id ? 'page' : undefined}
              onClick={() => onChangeMode(action.id)}
            >
              <action.icon size={21} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>

      {effectiveMode === 'client' ? <ClientDetailsPanel event={event} onSaved={onSaved} onDeleted={onDeleted} /> : null}
      {effectiveMode === 'staff' ? <StaffAssignmentsPanel event={event} onSaved={onSaved} /> : null}
      {effectiveMode === 'notes' ? <NotesPanel event={event} viewerEmail={viewerEmail} viewerName={viewerName} onSaved={onSaved} /> : null}
      {effectiveMode === 'files' ? <FilesPanel event={event} onSaved={onSaved} /> : null}
    </section>
  );
}
