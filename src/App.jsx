import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import project from '../project.json';
import { sortLedgerEvents } from './activity.js';
import { cacheViewer, clearCachedViewer, getCachedViewer, getGoogleCredential, getStaySignedInPreference, GOOGLE_WEB_CLIENT_ID, loadGoogleIdentityScript, viewerFromGoogleCredential } from './auth.js';
import { EventCard, isHiddenLedgerStatus } from './components/EventCard.jsx';
import { EVENTS_CACHE_KEY, navItems } from './constants.js';
import { AdminPage } from './pages/AdminPage.jsx';
import { PayoutLedgerPage } from './pages/PayoutLedgerPage.jsx';
import { PayoutPage } from './pages/PayoutPage.jsx';
import { PricingPage } from './pages/PricingPage.jsx';
import { DetailPanel } from './panels/DetailPanel.jsx';
import { configurePricingSchedule } from './pricingMath.js';
import { pullEventsFromSheet, pullPricingRulesFromSheet, SHEET_WEB_APP_URL } from './sheetClient.js';

const LAST_SHEET_SYNC_KEY = 'events-app-2.0:last-sheet-sync-at';

function getProjectTitle() {
  return project?.project?.name || project?.name || 'Events App 3.0';
}

function GoogleSignInGate({ onSignedIn }) {
  const [authStatus, setAuthStatus] = useState('');
  const [staySignedIn, setStaySignedIn] = useState(() => getStaySignedInPreference());

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
              cacheViewer(viewer, response.credential, staySignedIn);
              onSignedIn(viewer);
            } catch (error) {
              setAuthStatus(error instanceof Error ? error.message : 'Google sign-in failed.');
            }
          },
        });
        const buttonHost = document.getElementById('google-signin-button');
        if (!buttonHost) return;
        buttonHost.replaceChildren();
        google.accounts.id.renderButton(buttonHost, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 300,
        });
        if (staySignedIn) google.accounts.id.prompt();
      } catch (error) {
        if (!cancelled) setAuthStatus(error instanceof Error ? error.message : 'Google sign-in failed to load.');
      }
    }

    void bootGoogleSignIn();
    return () => {
      cancelled = true;
    };
  }, [onSignedIn, staySignedIn]);

  return (
    <main className="auth-screen">
      <section className="auth-card auth-card--signin">
        <div className="auth-emblem"><img src="/apple-touch-icon.png" alt="Anatomy Events" /></div>
        <div className="auth-heading">
          <span>Anatomy Events</span>
          <h1>Events App 3.0</h1>
          <p>Sign in with your approved Google account.</p>
        </div>
        <div className="auth-signin-panel">
          <div id="google-signin-button" className="google-signin-button" />
          <label className="stay-signed-in-option">
            <input type="checkbox" checked={staySignedIn} onChange={(event) => setStaySignedIn(event.target.checked)} />
            <span>
              <strong>Keep me signed in</strong>
              <small>Recommended for the installed app.</small>
            </span>
          </label>
        </div>
        {authStatus ? <p className="save-status">{authStatus}</p> : null}
      </section>
    </main>
  );
}

function formatSyncTime(value) {
  if (!value) return 'Not updated yet';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Not updated yet';
  return `Updated ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function SheetSyncMenu({ syncStatus, syncError, lastSyncAt, onRefresh }) {
  const isBusy = syncStatus === 'loading' || syncStatus === 'refreshing';
  const statusLabel = syncError ? 'Sheet needs attention' : isBusy ? 'Updating Sheet data…' : formatSyncTime(lastSyncAt);

  return (
    <details className={syncError ? 'sheet-sync-menu has-error' : 'sheet-sync-menu'}>
      <summary>
        <span className="sheet-sync-indicator" aria-hidden="true" />
        <strong>{statusLabel}</strong>
        <span>Sheet menu</span>
      </summary>
      <div className="sheet-sync-menu__body">
        <button type="button" className="secondary-button" onClick={onRefresh} disabled={isBusy}>
          <RefreshCw size={16} className={isBusy ? 'is-spinning' : ''} />
          {isBusy ? 'Refreshing…' : 'Refresh Sheet'}
        </button>
        <div className="sheet-sync-menu__status" aria-live="polite">
          <strong>{formatSyncTime(lastSyncAt)}</strong>
          {syncError ? <span>{syncError}</span> : <span>Sheet data is available.</span>}
        </div>
        {syncError ? (
          <a href={SHEET_WEB_APP_URL} target="_blank" rel="noreferrer">Open Apps Script</a>
        ) : null}
      </div>
    </details>
  );
}

function AccessDenied({ viewer, onSignOut }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <img src="/apple-touch-icon.png" alt="" />
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
  const [lastSyncAt, setLastSyncAt] = useState(() => window.localStorage.getItem(LAST_SHEET_SYNC_KEY) || '');
  const [pricingSource, setPricingSource] = useState('loading');
  const [activePage, setActivePage] = useState('events');
  const [detail, setDetail] = useState(null);
  const [viewer, setViewer] = useState(() => getCachedViewer());
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
  );

  useEffect(() => {
    if (!viewer || !getStaySignedInPreference() || getGoogleCredential() || !GOOGLE_WEB_CLIENT_ID) return undefined;
    let cancelled = false;

    void loadGoogleIdentityScript().then((google) => {
      if (cancelled) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        auto_select: true,
        callback: (response) => {
          if (cancelled || !response.credential) return;
          const refreshedViewer = viewerFromGoogleCredential(response.credential);
          cacheViewer(refreshedViewer, response.credential, true);
          setViewer(refreshedViewer);
        },
      });
      google.accounts.id.prompt();
    }).catch(() => {
      // The remembered viewer can still use the app; saving will request a fresh sign-in if needed.
    });

    return () => {
      cancelled = true;
    };
  }, [viewer]);

  useEffect(() => {
    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    function handleInstalled() {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }

  async function loadEvents() {
    setSyncStatus((current) => (events.length > 0 && current === 'connected' ? 'refreshing' : 'loading'));
    setSyncError('');
    try {
      const [sheetEvents, pricingRows] = await Promise.all([
        pullEventsFromSheet(),
        pullPricingRulesFromSheet().catch(() => null),
      ]);
      setPricingSource(pricingRows && configurePricingSchedule(pricingRows) ? 'live' : 'fallback');
      setEvents(sheetEvents);
      setDetail((current) => {
        if (!current?.event?.entryId) return current;
        const refreshedEvent = sheetEvents.find((event) => event.entryId === current.event.entryId);
        return refreshedEvent ? { ...current, event: refreshedEvent } : current;
      });
      window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(sheetEvents));
      const syncedAt = String(Date.now());
      window.localStorage.setItem(LAST_SHEET_SYNC_KEY, syncedAt);
      setLastSyncAt(syncedAt);
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

  function removeDeletedEvent(deletedEvent) {
    setEvents((current) => {
      const next = current.filter((event) => event.entryId !== deletedEvent.entryId);
      window.localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    setDetail(null);
  }

  const visibleNavItems = useMemo(() => {
    if (!viewer?.isAllowlisted) return navItems.filter((item) => item.id === 'events');
    return navItems;
  }, [viewer?.isAllowlisted]);
  const visibleLedgerEvents = useMemo(
    () => sortLedgerEvents(events.filter((event) => !isHiddenLedgerStatus(event))),
    [events],
  );

  function signOut() {
    window.google?.accounts?.id?.disableAutoSelect();
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
          <button
            type="button"
            className={syncStatus === 'loading' || syncStatus === 'refreshing' ? 'brand-refresh is-refreshing' : 'brand-refresh'}
            onClick={loadEvents}
            disabled={syncStatus === 'loading' || syncStatus === 'refreshing'}
            title="Refresh current page"
            aria-label="Refresh current page from Sheet"
          >
            <img src="/apple-touch-icon.png" alt="" />
          </button>
          <div>
            <strong>Events App 3.0</strong>
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
        {detail ? (
          <DetailPanel
            detail={detail}
            viewerEmail={viewer.email}
            onBack={() => setDetail(null)}
            onSaved={replaceSavedEvent}
            onDeleted={removeDeletedEvent}
            onChangeMode={(mode) => setDetail((current) => (current ? { ...current, mode } : current))}
          />
        ) : activePage === 'pricing' ? (
          <PricingPage events={events} viewer={viewer} onSaved={replaceSavedEvent} />
        ) : activePage === 'payout' ? (
          <PayoutPage events={events} viewer={viewer} />
        ) : activePage === 'admin' ? (
          <AdminPage
            viewer={viewer}
            onOpenPage={setActivePage}
            canInstall={Boolean(installPrompt)}
            isInstalled={isInstalled}
            onInstall={installApp}
          />
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
                    pricingSource={pricingSource}
                    onAction={(mode, selectedEvent) => setDetail({ mode, event: selectedEvent })}
                  />
                ))
            ) : (
              <section className="empty-state">
                <strong>{syncStatus === 'loading' ? 'Loading events from sheet...' : 'No events loaded'}</strong>
                <span>Events App 3.0 will only show Sheet-backed rows here.</span>
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
      <SheetSyncMenu syncStatus={syncStatus} syncError={syncError} lastSyncAt={lastSyncAt} onRefresh={loadEvents} />
    </main>
  );
}
