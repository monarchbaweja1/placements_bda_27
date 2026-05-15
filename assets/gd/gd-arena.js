(function initGdArena() {
  'use strict';

  const GD_TOPICS = {
    bda: [
      'AI vs human analysts — who will win in BFSI?',
      'Data privacy in India: is regulation killing innovation?',
      'Power BI vs Tableau — which tool dominates the market?',
      'Will ChatGPT replace data scientists by 2030?',
      'Ethical AI in credit scoring — opportunity or risk?'
    ],
    bifs: [
      'RBI\'s new digital lending norms — too strict or necessary?',
      'India\'s path to becoming a global financial hub',
      'UPI 2.0 — what\'s next for digital payments in India?',
      'Green finance bonds — are Indian banks ready?',
      'NBFC crisis — systemic risk or isolated events?'
    ],
    hcm: [
      'Generic vs patented drugs — India\'s pharma dilemma',
      'Digital health in tier-2 cities — challenges & solutions',
      'Hospital chains consolidation — good for patients or not?',
      'AI in clinical trials — opportunity or overhype?',
      'India\'s healthcare insurance gap — how to bridge it?'
    ],
    core: [
      'D2C vs retail — the future of FMCG distribution',
      'Sustainability in supply chains — cost or competitive edge?',
      'Quick commerce vs e-commerce — winner takes all?',
      'Brand India: how Indian companies can go global',
      'Gig economy — threat or opportunity for HR functions?'
    ]
  };

  let state = {
    view: 'lobby',
    sessions: [],
    currentSession: null,
    currentProgramme: 'bda',
    isModerator: false,
    timerStart: null,
    timerInterval: null,
    pollInterval: null,
    countdownInterval: null,
    timerPaused: false,
    timerPauseAt: null
  };

  function getToken() {
    try {
      const keys = Object.keys(localStorage);
      // Supabase JS v2: sb-{ref}-auth-token
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) {
        const d = JSON.parse(localStorage.getItem(sbKey) || '{}');
        const t = d?.access_token || d?.session?.access_token || d?.currentSession?.access_token;
        if (t) return t;
      }
      // Fallback: scan all keys that mention auth
      for (const key of keys) {
        if (!key.includes('auth')) continue;
        try {
          const val = localStorage.getItem(key);
          if (!val || !val.includes('access_token')) continue;
          const d = JSON.parse(val);
          const t = d?.access_token || d?.session?.access_token || d?.currentSession?.access_token;
          if (t && t.length > 20) return t;
        } catch {}
      }
    } catch {}
    return null;
  }

  function getProgramme() { return localStorage.getItem('selectedProgramme') || 'bda'; }

  function getCurrentUserId() {
    try {
      const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) {
        const d = JSON.parse(localStorage.getItem(sbKey) || '{}');
        return d?.user?.id || null;
      }
    } catch {}
    return null;
  }

  async function apiGet(path) {
    const token = getToken();
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    let payload;
    try { payload = await res.json(); } catch { throw new Error('Server returned an unexpected response.'); }
    if (!res.ok || !payload?.ok) throw new Error(payload?.error?.message || 'Request failed.');
    return payload;
  }

  async function apiPost(path, body) {
    const token = getToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    let payload;
    try { payload = await res.json(); } catch { throw new Error('Server returned an unexpected response.'); }
    if (!res.ok || !payload?.ok) throw new Error(payload?.error?.message || 'Request failed.');
    return payload;
  }

  // ── Helpers ────────────────────────────────────────────────
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }

  function formatScheduledAt(iso) {
    if (!iso) return 'Date TBD';
    const d = new Date(iso);
    const now = new Date();
    const sessionDateStr = d.toDateString();
    let dateLabel;
    if (sessionDateStr === now.toDateString()) dateLabel = 'Today';
    else if (sessionDateStr === new Date(now.getTime() + 86400000).toDateString()) dateLabel = 'Tomorrow';
    else dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateLabel}, ${time}`;
  }

  function canJoinSession(scheduledAt) {
    if (!scheduledAt) return true;
    return new Date(scheduledAt).getTime() - Date.now() <= 15 * 60 * 1000;
  }

  function formatCountdown(scheduledAt) {
    if (!scheduledAt) return '';
    const diff = new Date(scheduledAt).getTime() - Date.now();
    if (diff <= 0) return '';
    const totalMin = Math.ceil(diff / 60000);
    if (totalMin > 60 * 24) {
      const d = Math.floor(totalMin / (60 * 24));
      const h = Math.floor((totalMin % (60 * 24)) / 60);
      return `Opens in ${d}d${h > 0 ? ' ' + h + 'h' : ''}`;
    }
    if (totalMin > 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `Opens in ${h}h${m > 0 ? ' ' + m + 'm' : ''}`;
    }
    return `Opens in ${totalMin}m`;
  }

  function showStatus(el, type, msg) {
    el.className = `pg-gd-status ${type} visible`;
    el.innerHTML = type === 'loading' ? `<div class="pg-gd-spinner"></div>${msg}` : msg;
  }
  function clearStatus(el) { el.className = 'pg-gd-status'; el.textContent = ''; }

  // ── Build DOM ──────────────────────────────────────────────
  const slotOptions = Array.from({ length: 10 }, (_, i) =>
    `<option value="${i + 1}">GD SLOT-${i + 1}</option>`
  ).join('');

  const minDate = new Date().toISOString().split('T')[0];

  const wrap = document.createElement('div');
  wrap.className = 'pg-gd-wrap';
  wrap.innerHTML = `
    <button class="pg-gd-trigger" type="button" aria-label="Open GD Arena">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M17 8C17 8 17.5 5.5 15.5 4C13.5 2.5 10.5 3 9 5C7.5 7 8 10 9.5 11.5"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M4 20v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.7"/>
        <path d="M20 8c0 2-1.5 3.5-3 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M4 8c0 2 1.5 3.5 3 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <span class="pg-gd-tip" aria-hidden="true">GD Arena</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'pg-gd-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'GD Arena — Group Discussion');
  overlay.innerHTML = `
    <div class="pg-gd-modal">
      <div class="pg-gd-head">
        <div class="pg-gd-head-icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17 8C17 8 17.5 5.5 15.5 4C13.5 2.5 10.5 3 9 5C7.5 7 8 10 9.5 11.5"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 20v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.8"/>
            <path d="M20 8c0 2-1.5 3.5-3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 8c0 2 1.5 3.5 3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="pg-gd-head-text">
          <strong>GD Arena</strong>
          <span>Schedule GD sessions &bull; Join opens 15 min before</span>
        </div>
        <span class="pg-gd-prog-badge" id="pgGdProgBadge">BDA</span>
        <button class="pg-gd-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="pg-gd-tabs" id="pgGdTabs">
        <button class="pg-gd-tab active" data-tab="lobby">Sessions</button>
        <button class="pg-gd-tab" data-tab="create">Schedule New</button>
      </div>

      <div class="pg-gd-body" id="pgGdBody">

        <!-- ── Lobby View ── -->
        <div id="pgGdLobbyView">
          <div class="pg-gd-lobby-toolbar">
            <span class="pg-gd-lobby-label" id="pgGdLobbyLabel">GD Sessions</span>
            <button class="pg-gd-refresh-btn" id="pgGdRefreshBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              Refresh
            </button>
          </div>

          <div id="pgGdSessionsList"></div>

          <div class="pg-gd-create-cta" id="pgGdCreateCta">
            <span>Don't see your slot?</span>
            <button class="pg-gd-start-btn" id="pgGdStartNewBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:16px;height:16px">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Schedule a Session
            </button>
          </div>
          <div class="pg-gd-status" id="pgGdLobbyStatus"></div>
        </div>

        <!-- ── Create View ── -->
        <div id="pgGdCreateView" style="display:none">
          <div class="pg-gd-create-form">

            <div class="pg-gd-form-group">
              <label class="pg-gd-form-label" for="pgGdTopic">Discussion Topic *</label>
              <input class="pg-gd-form-input" id="pgGdTopic" type="text" maxlength="200"
                placeholder="e.g. AI vs human analysts — who will win in BFSI?">
              <div class="pg-gd-form-charcount"><span id="pgGdTopicChars">0</span>/200</div>
              <div class="pg-gd-form-hint">Or pick a quick topic for your programme:</div>
              <div class="pg-gd-topic-suggestions" id="pgGdTopicSuggestions"></div>
            </div>

            <div class="pg-gd-form-group">
              <label class="pg-gd-form-label" for="pgGdDesc">Brief context (optional)</label>
              <textarea class="pg-gd-form-textarea" id="pgGdDesc" maxlength="500"
                placeholder="Add any context or focus area for the group discussion..."></textarea>
              <div class="pg-gd-form-charcount"><span id="pgGdDescChars">0</span>/500</div>
            </div>

            <div class="pg-gd-form-row">
              <div class="pg-gd-form-col">
                <label class="pg-gd-form-label" for="pgGdSlot">Slot</label>
                <select class="pg-gd-form-select" id="pgGdSlot">${slotOptions}</select>
              </div>
              <div class="pg-gd-form-col">
                <label class="pg-gd-form-label" for="pgGdDate">Date *</label>
                <input class="pg-gd-form-input" id="pgGdDate" type="date" min="${minDate}">
              </div>
              <div class="pg-gd-form-col">
                <label class="pg-gd-form-label" for="pgGdTime">Time *</label>
                <input class="pg-gd-form-input" id="pgGdTime" type="time">
              </div>
            </div>

            <button class="pg-gd-create-submit" id="pgGdCreateSubmit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:18px;height:18px">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Schedule GD Session
            </button>
            <div class="pg-gd-create-note">
              A Jitsi Meet video room is auto-created. Join opens 15 minutes before the scheduled time.
            </div>
            <div class="pg-gd-status" id="pgGdCreateStatus"></div>

          </div>
        </div>

        <!-- ── Session View ── -->
        <div id="pgGdSessionView" style="display:none">
          <div class="pg-gd-session-view">
            <div class="pg-gd-video-pane" id="pgGdVideoPane">
              <div class="pg-gd-video-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-2v10l-5-2"/>
                </svg>
                <strong>Loading video room…</strong>
                <p>The Jitsi Meet room is loading. Allow camera &amp; microphone when prompted.</p>
              </div>
            </div>

            <div class="pg-gd-session-sidebar">
              <div class="pg-gd-session-info">
                <div class="pg-gd-session-slot" id="pgGdSessionSlot"></div>
                <div class="pg-gd-session-topic-label">Topic</div>
                <div class="pg-gd-session-topic-text" id="pgGdSessionTopic">—</div>
                <div class="pg-gd-timer">
                  <div>
                    <div class="pg-gd-timer-display" id="pgGdTimerDisplay">00:00</div>
                    <div class="pg-gd-timer-label">Session duration</div>
                  </div>
                </div>
              </div>

              <div class="pg-gd-participants-panel">
                <div class="pg-gd-participants-label">
                  Participants
                  <span class="pg-gd-participants-count" id="pgGdParticipantCount">0/11</span>
                </div>
                <div class="pg-gd-participant-list" id="pgGdParticipantList">
                  <div class="pg-gd-participant-item">
                    <div class="pg-gd-participant-avatar">Y</div>
                    <span class="pg-gd-participant-name">You</span>
                    <span id="pgGdYourRole" style="font-size:11px;color:#9aa5b1"></span>
                  </div>
                </div>
              </div>

              <div class="pg-gd-mod-panel" id="pgGdModPanel" style="display:none">
                <div class="pg-gd-mod-label"><span>👑</span> Moderator Controls</div>
                <div class="pg-gd-mod-actions">
                  <button class="pg-gd-mod-btn" id="pgGdTimerToggleBtn">⏸ Pause Timer</button>
                  <button class="pg-gd-mod-btn danger" id="pgGdEndSessionBtn">End Session for All</button>
                </div>
              </div>

              <div class="pg-gd-session-actions">
                <button class="pg-gd-leave-btn" id="pgGdLeaveBtn">← Leave Session</button>
              </div>
            </div>
          </div>
          <div class="pg-gd-status" id="pgGdSessionStatus" style="margin-top:12px"></div>
        </div>

        <!-- ── Feedback View ── -->
        <div id="pgGdFeedbackView" style="display:none">
          <div class="pg-gd-feedback-view">
            <div class="pg-gd-feedback-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <h3>Session Ended — Good Discussion!</h3>
              <p>AI-powered GD feedback is coming soon. For now, reflect on your performance below.</p>
            </div>

            <div class="pg-gd-feedback-grid">
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Confidence Score</div>
                <div class="pg-gd-feedback-score">—</div>
                <div class="pg-gd-feedback-score-label"><span class="pg-gd-feedback-coming">Coming Soon</span></div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Speaking Time</div>
                <div class="pg-gd-feedback-score" id="pgGdFeedbackDuration">—</div>
                <div class="pg-gd-feedback-score-label">Total session time</div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Participation</div>
                <div class="pg-gd-feedback-score">—</div>
                <div class="pg-gd-feedback-score-label"><span class="pg-gd-feedback-coming">Coming Soon</span></div>
              </div>
            </div>

            <div class="pg-gd-feedback-note">
              <strong>Self-Assessment Tip:</strong> After every GD, ask yourself — Did I initiate? Did I build on others' points?
              Did I summarise effectively? Did I let others speak? These are the exact criteria real recruiters evaluate.
            </div>

            <div style="text-align:center">
              <button class="pg-gd-feedback-back-btn" id="pgGdBackToLobbyBtn">Back to Sessions →</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Element references ─────────────────────────────────────
  const triggerBtn       = wrap.querySelector('.pg-gd-trigger');
  const closeBtn         = overlay.querySelector('.pg-gd-close-btn');
  const tabs             = overlay.querySelectorAll('.pg-gd-tab');
  const lobbyView        = document.getElementById('pgGdLobbyView');
  const createView       = document.getElementById('pgGdCreateView');
  const sessionView      = document.getElementById('pgGdSessionView');
  const feedbackView     = document.getElementById('pgGdFeedbackView');
  const sessionsList     = document.getElementById('pgGdSessionsList');
  const lobbyStatus      = document.getElementById('pgGdLobbyStatus');
  const createStatus     = document.getElementById('pgGdCreateStatus');
  const sessionStatus    = document.getElementById('pgGdSessionStatus');
  const progBadge        = document.getElementById('pgGdProgBadge');
  const topicInput       = document.getElementById('pgGdTopic');
  const topicChars       = document.getElementById('pgGdTopicChars');
  const descInput        = document.getElementById('pgGdDesc');
  const descChars        = document.getElementById('pgGdDescChars');
  const slotSelect       = document.getElementById('pgGdSlot');
  const dateInput        = document.getElementById('pgGdDate');
  const timeInput        = document.getElementById('pgGdTime');
  const createSubmit     = document.getElementById('pgGdCreateSubmit');
  const refreshBtn       = document.getElementById('pgGdRefreshBtn');
  const startNewBtn      = document.getElementById('pgGdStartNewBtn');
  const topicSuggestions = document.getElementById('pgGdTopicSuggestions');
  const sessionTopicEl   = document.getElementById('pgGdSessionTopic');
  const sessionSlotEl    = document.getElementById('pgGdSessionSlot');
  const timerDisplay     = document.getElementById('pgGdTimerDisplay');
  const participantCount = document.getElementById('pgGdParticipantCount');
  const participantList  = document.getElementById('pgGdParticipantList');
  const yourRoleEl       = document.getElementById('pgGdYourRole');
  const modPanel         = document.getElementById('pgGdModPanel');
  const timerToggleBtn   = document.getElementById('pgGdTimerToggleBtn');
  const endSessionBtn    = document.getElementById('pgGdEndSessionBtn');
  const leaveBtn         = document.getElementById('pgGdLeaveBtn');
  const backToLobbyBtn   = document.getElementById('pgGdBackToLobbyBtn');
  const feedbackDuration = document.getElementById('pgGdFeedbackDuration');
  const videoPane        = document.getElementById('pgGdVideoPane');

  // ── Tab / View switching ───────────────────────────────────
  function switchTab(tabName) {
    if (state.currentSession && tabName !== 'lobby' && tabName !== 'create') return;
    state.view = tabName;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    lobbyView.style.display    = tabName === 'lobby'  ? '' : 'none';
    createView.style.display   = tabName === 'create' ? '' : 'none';
    sessionView.style.display  = tabName === 'session'  ? '' : 'none';
    feedbackView.style.display = tabName === 'feedback' ? '' : 'none';
    document.getElementById('pgGdTabs').style.display =
      (tabName === 'session' || tabName === 'feedback') ? 'none' : '';
  }

  function enterView(viewName) {
    state.view = viewName;
    lobbyView.style.display    = viewName === 'lobby'    ? '' : 'none';
    createView.style.display   = viewName === 'create'   ? '' : 'none';
    sessionView.style.display  = viewName === 'session'  ? '' : 'none';
    feedbackView.style.display = viewName === 'feedback' ? '' : 'none';
    document.getElementById('pgGdTabs').style.display =
      (viewName === 'session' || viewName === 'feedback') ? 'none' : '';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === viewName));
  }

  // ── Session list rendering ─────────────────────────────────
  function renderSessions(sessions) {
    if (!sessions || sessions.length === 0) {
      sessionsList.innerHTML = `
        <div class="pg-gd-empty">
          <div class="pg-gd-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <strong>No sessions scheduled</strong>
          <p>Be the first to schedule a GD session for your programme. Others can join 15 minutes before the session time.</p>
        </div>
      `;
      return;
    }

    sessionsList.innerHTML = sessions.map(s => {
      const count = s.participant_count || 0;
      const max   = s.max_participants || 11;
      const isFull = count >= max;
      const pct    = Math.min(100, Math.round((count / max) * 100));
      const isActive = s.status === 'active';
      const slotNum  = s.slot_number || '?';
      const canJoin  = !isFull && canJoinSession(s.scheduled_at);
      const countdown = !isFull && !canJoin && s.scheduled_at ? formatCountdown(s.scheduled_at) : '';
      const prog     = (s.programme || 'bda').toUpperCase();
      const creator  = escHtml(s.creatorName || 'Unknown');
      const roll     = s.creatorRoll ? ` · ${escHtml(s.creatorRoll)}` : '';

      const statusBadge = isActive
        ? `<span class="pg-gd-card-status-active"><span class="pg-gd-live-dot"></span>Live</span>`
        : `<span class="pg-gd-card-status-waiting">Scheduled</span>`;

      return `
        <div class="pg-gd-session-card" data-id="${s.id}" data-scheduled="${s.scheduled_at || ''}">
          <div class="pg-gd-card-body">
            <div class="pg-gd-card-top-row">
              <span class="pg-gd-slot-badge">GD SLOT-${slotNum}</span>
              <div class="pg-gd-card-badges">
                <span class="pg-gd-card-prog">${prog}</span>
                ${statusBadge}
              </div>
            </div>
            <div class="pg-gd-card-topic">${escHtml(s.topic)}</div>
            ${s.description ? `<div class="pg-gd-card-desc">${escHtml(s.description.slice(0,100))}${s.description.length > 100 ? '…' : ''}</div>` : ''}
            <div class="pg-gd-card-schedule">📅 ${formatScheduledAt(s.scheduled_at)}</div>
            <div class="pg-gd-card-creator">👤 ${creator}${roll}</div>
            <div class="pg-gd-participant-bar">
              <div class="pg-gd-participant-label">
                <span class="pg-gd-participant-count">${count}/${max} participants</span>
                ${isFull ? '<span class="pg-gd-participant-full">Full</span>' : ''}
              </div>
              <div class="pg-gd-bar-track">
                <div class="pg-gd-bar-fill${isFull ? ' full' : ''}" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
          <div class="pg-gd-join-col">
            <button class="pg-gd-join-btn${canJoin ? ' ready' : ''}"
                    data-id="${s.id}" data-full="${isFull}"
                    ${isFull || !canJoin ? 'disabled' : ''}>
              ${isFull ? 'Full' : (canJoin ? 'Join Now →' : 'Join Session')}
            </button>
            <span class="pg-gd-join-countdown">${countdown}</span>
          </div>
        </div>
      `;
    }).join('');

    startCountdownUpdates();
  }

  // Event delegation — handles buttons enabled after countdown expires
  sessionsList.addEventListener('click', e => {
    const btn = e.target.closest('.pg-gd-join-btn');
    if (!btn || btn.disabled || btn.dataset.full === 'true') return;
    joinSession(btn.dataset.id);
  });

  function updateJoinButtons() {
    sessionsList.querySelectorAll('.pg-gd-session-card').forEach(card => {
      const scheduledAt = card.dataset.scheduled;
      const btn = card.querySelector('.pg-gd-join-btn');
      const countdownEl = card.querySelector('.pg-gd-join-countdown');
      if (!btn || btn.dataset.full === 'true') return;

      const canJoin = canJoinSession(scheduledAt);
      btn.disabled = !canJoin;
      btn.textContent = canJoin ? 'Join Now →' : 'Join Session';
      btn.classList.toggle('ready', canJoin);
      if (countdownEl) countdownEl.textContent = !canJoin && scheduledAt ? formatCountdown(scheduledAt) : '';
    });
  }

  function startCountdownUpdates() {
    stopCountdownUpdates();
    state.countdownInterval = setInterval(updateJoinButtons, 30000);
  }
  function stopCountdownUpdates() {
    if (state.countdownInterval) { clearInterval(state.countdownInterval); state.countdownInterval = null; }
  }

  // ── Load sessions ──────────────────────────────────────────
  async function loadSessions() {
    state.currentProgramme = getProgramme();
    progBadge.textContent = state.currentProgramme.toUpperCase();
    document.getElementById('pgGdLobbyLabel').textContent = `GD Sessions — ${state.currentProgramme.toUpperCase()}`;
    showStatus(lobbyStatus, 'loading', 'Loading sessions…');
    try {
      const data = await apiGet(`/api/gd/sessions?programme=${state.currentProgramme}`);
      state.sessions = data.sessions || [];
      renderSessions(state.sessions);
      clearStatus(lobbyStatus);
    } catch (e) {
      renderSessions([]);
      showStatus(lobbyStatus, 'error', e.message || 'Could not load sessions. Check your connection.');
    }
  }

  // ── Join a session ─────────────────────────────────────────
  async function joinSession(sessionId) {
    showStatus(lobbyStatus, 'loading', 'Joining session…');
    try {
      const data = await apiPost('/api/gd/sessions', { action: 'join', sessionId });
      clearStatus(lobbyStatus);
      stopCountdownUpdates();
      enterSessionView(data.session);
    } catch (e) {
      showStatus(lobbyStatus, 'error', e.message || 'Could not join. Try refreshing.');
    }
  }

  // ── Enter session view ────────────────────────────────────
  function enterSessionView(session) {
    state.currentSession = session;
    state.isModerator = session.moderator_id === getCurrentUserId() || !!session.isCreator;

    enterView('session');

    sessionTopicEl.textContent = session.topic;
    sessionSlotEl.textContent  = session.slot_number ? `GD SLOT-${session.slot_number}` : 'GD Session';
    participantCount.textContent = `${session.participant_count}/${session.max_participants}`;
    modPanel.style.display = state.isModerator ? '' : 'none';
    yourRoleEl.textContent = state.isModerator ? '👑 Moderator' : 'Participant';

    // Embed Jitsi Meet — free, no API key required
    if (session.room_url) {
      videoPane.innerHTML = `
        <iframe
          class="pg-gd-video-iframe"
          src="${session.room_url}"
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          allowfullscreen
          title="GD Arena Video Room">
        </iframe>
      `;
    } else {
      videoPane.innerHTML = `
        <div class="pg-gd-video-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-2v10l-5-2"/>
          </svg>
          <strong>Video Room Unavailable</strong>
          <p>Use Google Meet or Zoom with your batchmates while tracking your session here.</p>
        </div>
      `;
    }

    state.timerStart  = session.started_at ? new Date(session.started_at).getTime() : Date.now();
    state.timerPaused = false;
    startTimer();
    state.pollInterval = setInterval(() => refreshParticipantCount(session.id), 15000);
  }

  async function refreshParticipantCount(sessionId) {
    try {
      const data = await apiGet(`/api/gd/sessions?programme=${state.currentProgramme}`);
      const updated = (data.sessions || []).find(s => s.id === sessionId);
      if (!updated) { clearPollInterval(); showEndedFeedback(); return; }
      participantCount.textContent = `${updated.participant_count}/${updated.max_participants}`;
      if (state.currentSession) state.currentSession.participant_count = updated.participant_count;
    } catch {}
  }

  // ── Timer ─────────────────────────────────────────────────
  function startTimer() {
    clearTimerInterval();
    state.timerInterval = setInterval(() => {
      if (!state.timerPaused) timerDisplay.textContent = formatDuration(Date.now() - state.timerStart);
    }, 1000);
  }
  function clearTimerInterval() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }
  function clearPollInterval()  { if (state.pollInterval)  { clearInterval(state.pollInterval);  state.pollInterval  = null; } }

  // ── Leave / End session ───────────────────────────────────
  async function leaveSession(endForAll = false) {
    if (!state.currentSession) return;
    showStatus(sessionStatus, 'loading', endForAll ? 'Ending session…' : 'Leaving session…');
    const sessionId = state.currentSession.id;
    const elapsed   = Date.now() - state.timerStart;
    try {
      await apiPost('/api/gd/sessions', { action: 'leave', sessionId, endSession: endForAll });
      clearTimerInterval();
      clearPollInterval();
      state.currentSession = null;
      feedbackDuration.textContent = formatDuration(elapsed);
      showEndedFeedback();
    } catch (e) {
      showStatus(sessionStatus, 'error', e.message || 'Could not leave. Try again.');
    }
  }

  function showEndedFeedback() { enterView('feedback'); }

  // ── Create / schedule session ──────────────────────────────
  async function createSession() {
    const topic = topicInput.value.trim();
    const date  = dateInput.value;
    const time  = timeInput.value;

    if (!topic) { showStatus(createStatus, 'error', 'Please enter a discussion topic.'); topicInput.focus(); return; }
    if (!date)  { showStatus(createStatus, 'error', 'Please select a date for the session.'); dateInput.focus(); return; }
    if (!time)  { showStatus(createStatus, 'error', 'Please select a time for the session.'); timeInput.focus(); return; }

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    const slotNum     = parseInt(slotSelect.value) || 1;
    const programme   = state.currentProgramme || getProgramme();

    createSubmit.disabled = true;
    showStatus(createStatus, 'loading', 'Scheduling GD session…');

    try {
      await apiPost('/api/gd/sessions', {
        topic,
        description: descInput.value.trim(),
        programme,
        slotNumber: slotNum,
        scheduledAt
      });

      showStatus(createStatus, 'success',
        `✓ GD SLOT-${slotNum} scheduled for ${formatScheduledAt(scheduledAt)}. Join opens 15 min before the session.`);

      topicInput.value = '';
      descInput.value  = '';
      topicChars.textContent = '0';
      descChars.textContent  = '0';

      setTimeout(() => {
        clearStatus(createStatus);
        switchTab('lobby');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'lobby'));
        loadSessions();
      }, 2200);
    } catch (e) {
      showStatus(createStatus, 'error', e.message || 'Could not schedule session. Please try again.');
    } finally {
      createSubmit.disabled = false;
    }
  }

  // ── Topic suggestions ──────────────────────────────────────
  function populateTopicSuggestions(programme) {
    const topics = GD_TOPICS[programme] || GD_TOPICS.bda;
    topicSuggestions.innerHTML = topics.map(t =>
      `<button class="pg-gd-topic-chip" type="button">${escHtml(t)}</button>`
    ).join('');
    topicSuggestions.querySelectorAll('.pg-gd-topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        topicInput.value = chip.textContent;
        topicChars.textContent = chip.textContent.length;
      });
    });
  }

  // ── Open / Close ──────────────────────────────────────────
  function openArena() {
    state.currentProgramme = getProgramme();
    progBadge.textContent = state.currentProgramme.toUpperCase();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (state.currentSession) { enterView('session'); return; }
    enterView('lobby');
    loadSessions();
    populateTopicSuggestions(state.currentProgramme);
  }

  function closeArena() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    stopCountdownUpdates();
    clearStatus(lobbyStatus);
    clearStatus(createStatus);
    clearStatus(sessionStatus);
  }

  // ── Event bindings ────────────────────────────────────────
  triggerBtn.addEventListener('click', openArena);
  closeBtn.addEventListener('click', closeArena);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeArena(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeArena(); });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (state.currentSession) return;
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'lobby')  loadSessions();
      if (tab.dataset.tab === 'create') populateTopicSuggestions(state.currentProgramme);
    });
  });

  refreshBtn.addEventListener('click', () => { clearStatus(lobbyStatus); loadSessions(); });

  startNewBtn.addEventListener('click', () => {
    switchTab('create');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'create'));
    populateTopicSuggestions(state.currentProgramme);
  });

  createSubmit.addEventListener('click', createSession);
  topicInput.addEventListener('input', () => { topicChars.textContent = topicInput.value.length; });
  descInput.addEventListener('input',  () => { descChars.textContent  = descInput.value.length;  });

  leaveBtn.addEventListener('click', () => {
    if (confirm('Leave the discussion session?')) leaveSession(false);
  });
  endSessionBtn.addEventListener('click', () => {
    if (confirm('End the session for all participants? This cannot be undone.')) leaveSession(true);
  });

  timerToggleBtn.addEventListener('click', () => {
    state.timerPaused = !state.timerPaused;
    if (state.timerPaused) {
      state.timerPauseAt = Date.now();
      timerToggleBtn.textContent = '▶ Resume Timer';
    } else {
      state.timerStart += (Date.now() - (state.timerPauseAt || Date.now()));
      timerToggleBtn.textContent = '⏸ Pause Timer';
    }
  });

  backToLobbyBtn.addEventListener('click', () => { enterView('lobby'); loadSessions(); });

  // ── Show trigger only when logged in ──────────────────────
  function syncVisibility() { wrap.hidden = !getToken(); }
  syncVisibility();
  const visibilityInterval = setInterval(() => {
    syncVisibility();
    if (getToken()) clearInterval(visibilityInterval);
  }, 3000);

  window.addEventListener('storage', e => {
    if (e.key === 'selectedProgramme') {
      state.currentProgramme = e.newValue || 'bda';
      progBadge.textContent = state.currentProgramme.toUpperCase();
    }
  });

})();
