import { MoveLeft } from 'lucide-react';

import { cardActions } from '../constants.js';
import { ClientDetailsPanel } from './ClientDetailsPanel.jsx';
import { FilesPanel } from './FilesPanel.jsx';
import { NotesPanel } from './NotesPanel.jsx';
import { StaffAssignmentsPanel } from './StaffAssignmentsPanel.jsx';

export function DetailPanel({ detail, viewerEmail, onBack, onSaved, onDeleted, onChangeMode }) {
  if (!detail) return null;
  const { mode, event } = detail;
  const activeAction = cardActions.find((action) => action.id === mode);

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
          {cardActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={mode === action.id ? 'active' : ''}
              title={action.label}
              aria-label={action.label}
              aria-current={mode === action.id ? 'page' : undefined}
              onClick={() => onChangeMode(action.id)}
            >
              <action.icon size={18} />
            </button>
          ))}
        </div>
      </div>

      {mode === 'client' ? <ClientDetailsPanel event={event} onSaved={onSaved} onDeleted={onDeleted} /> : null}
      {mode === 'staff' ? <StaffAssignmentsPanel event={event} onSaved={onSaved} /> : null}
      {mode === 'notes' ? <NotesPanel event={event} viewerEmail={viewerEmail} onSaved={onSaved} /> : null}
      {mode === 'files' ? <FilesPanel event={event} onSaved={onSaved} /> : null}
    </section>
  );
}
