import { useEffect, useMemo, useState } from 'react';

import project from '../project.json';
import { loadManualAppointments, sortLedgerEvents } from './activity.js';
import { cacheViewer, clearCachedViewer, getCachedViewer, GOOGLE_WEB_CLIENT_ID, loadGoogleIdentityScript, viewerFromGoogleCredential } from './auth.js';
import { EventCard, isHiddenLedgerStatus } from './components/EventCard.jsx';
import { EVENTS_CACHE_KEY, navItems } from './constants.js';
import { AdminPage } from './pages/AdminPage.jsx';
import { PayoutLedgerPage } from './pages/PayoutLedgerPage.jsx';
import { PayoutPage } from './pages/PayoutPage.jsx';
import { PricingPage } from './pages/PricingPage.jsx';
import { DetailPanel } from './panels/DetailPanel.jsx';
import { pullEventsFromSheet, SHEET_WEB_APP_URL } from './sheetClient.js';

function getProjectTitle() {
  return project?.project?.name || project?.name || 'Events App 2.0';
}

const logoSrc = `${import.meta.env.BASE_URL}assets/images/anatomy-logo-circle.png`;

function GoogleSignInGate({ onSignedIn }) {
  const [authStatus, setAuthStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootGoogleSignIn() {
      if (!GOOGLE_WEB_CLIENT_ID) {
        setAuthStatus('Google sign-in requires VITE_GOOGLE_WEB_CLIENT_ID in the app environment.');
        return;
      }

      try {
        const google = await loadGoogleIdentityScript();
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          callback: (response) => {
            try {
              const viewer = viewerFromGoogleCredential(response.credential);
              cacheViewer(viewer);
              onSignedIn(viewer);
            } catch (error) {
              setAuthStatus(error instanceof Error ? error.message : 'Google sign-in failed.');
            }
          },
        });
        google.accounts.id.renderButton(document.getElementById('google-signin-button'), {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 260,
        });
      } catch (error) {
        if (!cancelled) setAuthStatus(error instanceof Error ? error.message : 'Google sign-in failed to load.');
      }
    }

    void bootGoogleSignIn();
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <img src={logoSrc} alt="" />
        <h1>Events App 2.0</h1>
        <p>Sign in with your allowlisted Google account.</p>
        <div id="google-signin-button" className="google-signin-button" />
        {authStatus ? <p className="save-status">{authStatus}</p> : null}
      </section>
    </main>
  );
}

function AccessDenied({ viewer, onSignOut }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <img src={logoSrc} alt="" />
        <h1>Access Not Allowed</h1>
        <p>{viewer.email} is not on the Events App allowlist.</p>
        <button type="button" className="secondary-button" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}

export function App() {
  const [events, setEvents] = useState(() => {
    try {
      const cached = window.localStorage.getItem(EVENTS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [syncStatus, setSyncStatus] = useState('loading');
  const [syncError, setSyncError] = useState('');
  const [activePage, setActivePage] = useState('events');
  const [detail, setDetail] = useState(null);
  const [viewer, setViewer] = useState(() => getCachedViewer());
  const [manualAppointments, setManualAppointments] = useState(() => loadManualAppointments());

  async function loadEvents() {
    setSyncStatus((current) => (events.length > 0 && current === 'connected' ? 'refreshing' : 'loading'));
    setSyncError('');
    try {
      const sheetEvents = await pullEventsFromSheet();
      setEvents(sheetEvents);
      window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(sheetEvents));
      setSyncStatus('connected');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to load events from sheet.');
      setSyncStatus(events.length > 0 ? 'connected_error' : 'error');
    }
  }

  useEffect(() => {
    if (viewer?.isAllowlisted) void loadEvents();
  }, [viewer?.isAllowlisted]);

  function replaceSavedEvent(savedEvent) {
    setEvents((current) => {
      const next = current.map((event) => (event.entryId && event.entryId === savedEvent.entryId ? savedEvent : event));
      window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    setDetail((current) => (current ? { ...current, event: savedEvent } : current));
  }

  function handleManualAppointmentsChanged(nextManualAppointments) {
    setManualAppointments(nextManualAppointments);
  }

  function removeDeletedEvent(deletedEvent) {
    setEvents((current) => {
      const next = current.filter((event) => event.entryId !== deletedEvent.entryId);
      window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    setDetail(null);
  }

  const visibleNavItems = useMemo(() => {
    if (!viewer.isAllowlisted) return navItems.filter((item) => item.id === 'events');
    return navItems;
  }, [viewer.isAllowlisted]);
  const visibleLedgerEvents = useMemo(
    () => sortLedgerEvents(events.filter((event) => !isHiddenLedgerStatus(event)), manualAppointments),
    [events, manualAppointments],
  );

  function signOut() {
    clearCachedViewer();
    setViewer(null);
    setDetail(null);
    setActivePage('events');
  }

  if (!viewer) {
    return <GoogleSignInGate onSignedIn={setViewer} />;
  }

  if (!viewer.isAllowlisted) {
    return <AccessDenied viewer={viewer} onSignOut={signOut} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoSrc} alt="" />
          <div>
            <strong>Events App 2.0</strong>
            <span>{getProjectTitle()}</span>
          </div>
        </div>

        <nav aria-label="Primary">
          {visibleNavItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={activePage === item.id ? 'active' : ''}
              onClick={() => {
                setDetail(null);
                setActivePage(item.id);
              }}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" className="sign-out-button" onClick={signOut}>
          Sign out
        </button>
      </aside>

      <section className="workspace">
        {syncError ? (
          <section className="sync-error" aria-live="polite">
            <strong>Sheet connection issue</strong>
            <span>{syncError}</span>
            <a href={SHEET_WEB_APP_URL} target="_blank" rel="noreferrer">
              Open Apps Script
            </a>
          </section>
        ) : null}

        {detail ? (
          <DetailPanel
            detail={detail}
            onBack={() => setDetail(null)}
            onSaved={replaceSavedEvent}
            onDeleted={removeDeletedEvent}
            onManualAppointmentsChanged={handleManualAppointmentsChanged}
            onChangeMode={(mode) => setDetail((current) => (current ? { ...current, mode } : current))}
          />
        ) : activePage === 'pricing' ? (
          <PricingPage events={events} onSaved={replaceSavedEvent} />
        ) : activePage === 'payout' ? (
          <PayoutPage events={events} viewer={viewer} />
        ) : activePage === 'admin' ? (
          <AdminPage viewer={viewer} onOpenPage={setActivePage} onRefresh={loadEvents} />
        ) : activePage === 'payoutLedger' ? (
          <PayoutLedgerPage events={events} viewer={viewer} onBack={() => setActivePage('admin')} />
        ) : activePage === 'events' ? (
          <section className="event-list" aria-label="Upcoming client cards">
            {events.length > 0 ? (
              visibleLedgerEvents
                .map((event) => (
                  <EventCard
                    key={event.id || event.clientName}
                    event={event}
                    showAdminMoney={viewer.canAccessAdminTools}
                    onAction={(mode, selectedEvent) => setDetail({ mode, event: selectedEvent })}
                  />
                ))
            ) : (
              <section className="empty-state">
                <strong>{syncStatus === 'loading' ? 'Loading events from sheet...' : 'No events loaded'}</strong>
                <span>Events App 2.0 will only show Sheet-backed rows here.</span>
              </section>
            )}
          </section>
        ) : (
          <section className="empty-state">
            <strong>{navItems.find((item) => item.id === activePage)?.label || 'Page'} rebuild pending</strong>
            <span>This page will be rebuilt from project.json and docs/app-rules.json next.</span>
          </section>
        )}
      </section>
    </main>
  );
}
