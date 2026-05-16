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
    mineSessions: [],
    currentSession: null,
    currentProgramme: 'bda',
    timerStart: null,
    timerInterval: null,
    pollInterval: null,
    countdownInterval: null,
    speakingInterval: null,
    participantsCache: {},
    jitsiApi: null,
    recognition: null,
    speakingData: {},
    audioSpeakingState: {},
    dominantId: null,
    localJitsiId: null,
    speakingTurns: 0,
    interruptionCount: 0
  };

  let totalWords = 0;
  let fillerCount = 0;
  let wordTimestamps = [];
  let uniqueWords = new Set();
  let transcriptEntries = [];
  let audioThreshold = 0.06;

  const FILLERS = [
    'um','uh','er','erm',
    'like','you know','basically','actually','literally',
    'so','right','okay','kind of','sort of','i mean','you see',
    // Indian English
    'isn\'t it','what to say','how to say',
    'basically speaking','frankly speaking','no no','see see'
  ];

  // Pre-built regex for transcript filler highlighting
  const FILLER_REGEX = new RegExp(
    `\\b(${FILLERS.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  );

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
        <button class="pg-gd-tab" data-tab="mine">My Sessions</button>
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
              <label class="pg-gd-form-label" for="pgGdCreatorName">Your Name *</label>
              <input class="pg-gd-form-input" id="pgGdCreatorName" type="text" maxlength="100"
                placeholder="Enter your full name">
            </div>

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

        <!-- ── My Sessions View ── -->
        <div id="pgGdMineView" style="display:none">
          <div class="pg-gd-lobby-toolbar">
            <span class="pg-gd-lobby-label">My Scheduled Sessions</span>
            <button class="pg-gd-refresh-btn" id="pgGdMineRefreshBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              Refresh
            </button>
          </div>
          <div id="pgGdMineList"></div>
          <div class="pg-gd-status" id="pgGdMineStatus"></div>
        </div>

        <!-- ── Session View ── -->
        <div id="pgGdSessionView" style="display:none">
          <div class="pg-gd-session-view">

            <div class="pg-gd-video-pane">
              <div id="pgGdJitsiContainer"></div>
              <div class="pg-gd-video-notice">
                💡 If asked to log in, tap <strong>Log-in with Google</strong> once — this unlocks the room for everyone else instantly.
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
                  Speaking Time
                  <span class="pg-gd-participants-count" id="pgGdParticipantCount">0/11</span>
                </div>
                <div class="pg-gd-participant-list" id="pgGdParticipantList"></div>
              </div>

              <div class="pg-gd-transcript-panel" id="pgGdTranscriptPanel">
                <div class="pg-gd-transcript-label">Your speech <span class="pg-gd-transcript-hint">(fillers in orange)</span></div>
                <div class="pg-gd-transcript-body" id="pgGdTranscriptBody">
                  <div class="pg-gd-transcript-empty">Listening…</div>
                </div>
              </div>

              <div class="pg-gd-confidence-mini" id="pgGdConfidenceMini" style="display:none">
                <div class="pg-gd-confidence-label">Your Confidence</div>
                <div class="pg-gd-confidence-value" id="pgGdConfidenceValue">—</div>
                <div class="pg-gd-confidence-sub">Filler words &amp; pace</div>
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
                <div class="pg-gd-feedback-score" id="pgGdFeedbackConfidence">—</div>
                <div class="pg-gd-feedback-score-label" id="pgGdFeedbackConfidenceLabel">Filler words &amp; pace</div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Speaking Time</div>
                <div class="pg-gd-feedback-score" id="pgGdFeedbackDuration">—</div>
                <div class="pg-gd-feedback-score-label">Total session time</div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Participation</div>
                <div class="pg-gd-feedback-score" id="pgGdFeedbackParticipation">—</div>
                <div class="pg-gd-feedback-score-label" id="pgGdFeedbackParticipationLabel">Share of speaking time</div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Contributions</div>
                <div class="pg-gd-feedback-score" id="pgGdFeedbackTurns">—</div>
                <div class="pg-gd-feedback-score-label" id="pgGdFeedbackTurnsLabel">Speaking turns taken</div>
              </div>
              <div class="pg-gd-feedback-card">
                <div class="pg-gd-feedback-card-label">Vocabulary</div>
                <div class="pg-gd-feedback-score" id="pgGdFeedbackVocab">—</div>
                <div class="pg-gd-feedback-score-label" id="pgGdFeedbackVocabLabel">Lexical diversity</div>
              </div>
            </div>

            <div class="pg-gd-score-history" id="pgGdScoreHistory" style="display:none">
              <div class="pg-gd-history-label">Your GD Progress</div>
              <div class="pg-gd-history-header">
                <span>#</span><span>Date</span><span>Confidence</span><span>Participation</span><span>WPM</span>
              </div>
              <div id="pgGdHistoryList"></div>
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
  const mineView         = document.getElementById('pgGdMineView');
  const sessionView      = document.getElementById('pgGdSessionView');
  const feedbackView     = document.getElementById('pgGdFeedbackView');
  const sessionsList     = document.getElementById('pgGdSessionsList');
  const mineList         = document.getElementById('pgGdMineList');
  const mineStatus       = document.getElementById('pgGdMineStatus');
  const mineRefreshBtn   = document.getElementById('pgGdMineRefreshBtn');
  const lobbyStatus      = document.getElementById('pgGdLobbyStatus');
  const createStatus     = document.getElementById('pgGdCreateStatus');
  const sessionStatus    = document.getElementById('pgGdSessionStatus');
  const progBadge        = document.getElementById('pgGdProgBadge');
  const creatorNameInput = document.getElementById('pgGdCreatorName');
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
  const participantList        = document.getElementById('pgGdParticipantList');
  const leaveBtn               = document.getElementById('pgGdLeaveBtn');
  const backToLobbyBtn         = document.getElementById('pgGdBackToLobbyBtn');
  const feedbackDuration       = document.getElementById('pgGdFeedbackDuration');
  const feedbackConfidence     = document.getElementById('pgGdFeedbackConfidence');
  const feedbackParticipation  = document.getElementById('pgGdFeedbackParticipation');
  const confidenceMini         = document.getElementById('pgGdConfidenceMini');
  const confidenceValue        = document.getElementById('pgGdConfidenceValue');

  // ── Tab / View switching ───────────────────────────────────
  function switchTab(tabName) {
    if (state.currentSession && tabName !== 'lobby' && tabName !== 'create' && tabName !== 'mine') return;
    state.view = tabName;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    lobbyView.style.display    = tabName === 'lobby'  ? '' : 'none';
    createView.style.display   = tabName === 'create' ? '' : 'none';
    mineView.style.display     = tabName === 'mine'   ? '' : 'none';
    sessionView.style.display  = tabName === 'session'  ? '' : 'none';
    feedbackView.style.display = tabName === 'feedback' ? '' : 'none';
    document.getElementById('pgGdTabs').style.display =
      (tabName === 'session' || tabName === 'feedback') ? 'none' : '';
  }

  function enterView(viewName) {
    state.view = viewName;
    lobbyView.style.display    = viewName === 'lobby'    ? '' : 'none';
    createView.style.display   = viewName === 'create'   ? '' : 'none';
    mineView.style.display     = viewName === 'mine'     ? '' : 'none';
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

    const currentUserId = getCurrentUserId();

    sessionsList.innerHTML = sessions.map(s => {
      const count     = s.participant_count || 0;
      const max       = s.max_participants || 11;
      const isFull    = count >= max;
      const pct       = Math.min(100, Math.round((count / max) * 100));
      const isActive  = s.status === 'active';
      const slotNum   = s.slot_number || '?';
      const canJoin   = !isFull && canJoinSession(s.scheduled_at);
      const countdown = !isFull && !canJoin && s.scheduled_at ? formatCountdown(s.scheduled_at) : '';
      const prog      = (s.programme || 'bda').toUpperCase();
      const creator   = escHtml(s.creator_name || 'Unknown');
      const isCreator = currentUserId && currentUserId === s.created_by;
      const isBooked  = localStorage.getItem(`gd_booked_${s.id}`) === '1';

      const statusBadge = isActive
        ? `<span class="pg-gd-card-status-active"><span class="pg-gd-live-dot"></span>Live</span>`
        : `<span class="pg-gd-card-status-waiting">Scheduled</span>`;

      const deleteBtn = isCreator
        ? `<button class="pg-gd-delete-btn" data-action="delete-session" data-id="${s.id}" title="Delete session">🗑</button>`
        : '';

      const bookBtnHtml = isBooked
        ? `<span class="pg-gd-booked-badge">✓ Booked</span>`
        : `<button class="pg-gd-book-btn" data-action="show-book-form" data-id="${s.id}">Book Session</button>`;

      return `
        <div class="pg-gd-session-card" data-id="${s.id}" data-scheduled="${s.scheduled_at || ''}">
          <div class="pg-gd-card-body">
            <div class="pg-gd-card-top-row">
              <button class="pg-gd-slot-badge-btn" data-action="toggle-participants" data-id="${s.id}">
                GD SLOT-${slotNum} <span class="pg-gd-slot-chevron">▾</span>
              </button>
              <div class="pg-gd-card-badges">
                <span class="pg-gd-card-prog">${prog}</span>
                ${statusBadge}
                ${deleteBtn}
              </div>
            </div>
            <div class="pg-gd-card-topic">${escHtml(s.topic)}</div>
            ${s.description ? `<div class="pg-gd-card-desc">${escHtml(s.description.slice(0,100))}${s.description.length > 100 ? '…' : ''}</div>` : ''}
            <div class="pg-gd-card-schedule">📅 ${formatScheduledAt(s.scheduled_at)}</div>
            <div class="pg-gd-card-creator">👤 ${creator}</div>
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
            ${bookBtnHtml}
            <button class="pg-gd-join-btn${canJoin ? ' ready' : ''}"
                    data-action="join-session" data-id="${s.id}" data-full="${isFull}"
                    ${isFull || !canJoin ? 'disabled' : ''}>
              ${isFull ? 'Full' : (canJoin ? 'Join Now →' : 'Join Session')}
            </button>
            <span class="pg-gd-join-countdown">${countdown}</span>
          </div>
          <div class="pg-gd-participants-expand" id="pgGdPtList-${s.id}" style="display:none"></div>
          <div class="pg-gd-book-form" id="pgGdBookForm-${s.id}" style="display:none">
            <div class="pg-gd-book-form-fields">
              <input class="pg-gd-book-input" id="pgGdBookName-${s.id}" type="text" placeholder="Your Full Name *" maxlength="100">
              <input class="pg-gd-book-input" id="pgGdBookRoll-${s.id}" type="text" placeholder="Roll Number *" maxlength="50">
              <input class="pg-gd-book-input" id="pgGdBookProg-${s.id}" type="text" placeholder="Programme (e.g. BDA)" maxlength="20">
            </div>
            <div class="pg-gd-book-form-actions">
              <button class="pg-gd-book-confirm-btn" data-action="confirm-book" data-id="${s.id}">Confirm Booking</button>
              <button class="pg-gd-book-cancel-btn" data-action="cancel-book" data-id="${s.id}">Cancel</button>
            </div>
            <div class="pg-gd-book-form-status"></div>
          </div>
        </div>
      `;
    }).join('');

    startCountdownUpdates();
  }

  // Event delegation — all card interactions
  sessionsList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    const card   = btn.closest('.pg-gd-session-card');

    if (action === 'toggle-participants') return toggleParticipants(id, card);
    if (action === 'show-book-form')      return showBookForm(id, card);
    if (action === 'cancel-book')         return cancelBooking(id, card);
    if (action === 'confirm-book')        return confirmBooking(id, card);
    if (action === 'delete-session')      return confirmDeleteSession(id, card);
    if (action === 'join-session' && !btn.disabled && btn.dataset.full !== 'true') joinSession(id);
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

  // ── Jitsi External API ─────────────────────────────────────
  function loadJitsiScript() {
    return new Promise(resolve => {
      if (window.JitsiMeetExternalAPI) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://meet.jit.si/external_api.js';
      s.onload = resolve;
      s.onerror = resolve; // fail silently, handled below
      document.head.appendChild(s);
    });
  }

  function initJitsi(session) {
    const container = document.getElementById('pgGdJitsiContainer');
    if (!container || !window.JitsiMeetExternalAPI) return;

    const roomName = session.room_name || (session.room_url || '').split('/').pop() || 'BDA27-GD-Room';

    state.jitsiApi = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName,
      parentNode: container,
      width: '100%',
      height: '100%',
      configOverwrite: {
        prejoinPageEnabled: false,
        disableModeratorIndicator: true,
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true,
        enableNoisyMicDetection: false,
        lobby: { enabled: false, autoKnock: false }
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: ['microphone','camera','desktop','tileview','fullscreen','hangup']
      }
    });

    state.jitsiApi.on('videoConferenceJoined', ({ id, displayName }) => {
      state.localJitsiId = id;
      if (!state.speakingData[id]) state.speakingData[id] = { name: displayName || 'You', totalMs: 0, startMs: null };
      renderSpeakingTimes();
    });

    state.jitsiApi.on('participantJoined', ({ id, displayName }) => {
      if (!state.speakingData[id]) state.speakingData[id] = { name: displayName || 'Participant', totalMs: 0, startMs: null };
      renderSpeakingTimes();
    });

    state.jitsiApi.on('participantLeft', ({ id }) => {
      if (state.dominantId === id) state.dominantId = null;
      delete state.speakingData[id];
      renderSpeakingTimes();
    });

    // audioLevelsChanged gives per-person audio levels — more accurate than dominant speaker
    let usingAudioLevels = false;
    state.jitsiApi.on('audioLevelsChanged', (data) => {
      usingAudioLevels = true;
      const levels = (data?.audioLevels) || (typeof data === 'object' ? data : {});
      const now = Date.now();
      Object.entries(levels).forEach(([id, level]) => {
        const d = state.speakingData[id];
        if (!d) return;
        if (!state.audioSpeakingState[id]) {
          state.audioSpeakingState[id] = { speaking: false, aboveStart: null, graceTimer: null };
        }
        const s = state.audioSpeakingState[id];
        if (level > audioThreshold) {
          if (!s.aboveStart) s.aboveStart = now;
          if (s.graceTimer) { clearTimeout(s.graceTimer); s.graceTimer = null; }
          if (!s.speaking && (now - s.aboveStart) >= 250) {
            s.speaking = true;
            if (!d.startMs) d.startMs = now;
            if (id === state.localJitsiId) {
              state.speakingTurns++;
              const othersAlreadySpeaking = Object.entries(state.audioSpeakingState)
                .some(([oid, os]) => oid !== id && os.speaking);
              if (othersAlreadySpeaking) state.interruptionCount++;
            }
          }
        } else {
          if (!s.speaking) { s.aboveStart = null; return; }
          if (s.graceTimer) return;
          s.graceTimer = setTimeout(() => {
            s.speaking = false;
            if (d.startMs) { d.totalMs += Date.now() - d.startMs; d.startMs = null; }
            s.graceTimer = null;
            s.aboveStart = null;
          }, 600);
        }
      });
    });

    // Fallback: use dominant speaker if audioLevelsChanged doesn't fire
    state.jitsiApi.on('dominantSpeakerChanged', ({ id }) => {
      if (usingAudioLevels) return;
      const now = Date.now();
      if (state.dominantId && state.speakingData[state.dominantId]?.startMs) {
        state.speakingData[state.dominantId].totalMs += now - state.speakingData[state.dominantId].startMs;
        state.speakingData[state.dominantId].startMs = null;
      }
      state.dominantId = id;
      if (state.speakingData[id]) state.speakingData[id].startMs = now;
    });
  }

  function renderSpeakingTimes() {
    const entries = Object.entries(state.speakingData);
    if (entries.length === 0) {
      participantList.innerHTML = '<div class="pg-gd-spk-empty">Waiting for participants to join…</div>';
      return;
    }
    const maxMs = Math.max(1, ...entries.map(([, d]) => {
      const live = d.startMs ? Date.now() - d.startMs : 0;
      return d.totalMs + live;
    }));
    participantList.innerHTML = entries
      .sort(([, a], [, b]) => (b.totalMs + (b.startMs ? Date.now() - b.startMs : 0)) - (a.totalMs + (a.startMs ? Date.now() - a.startMs : 0)))
      .map(([id, d]) => {
        const live    = d.startMs ? Date.now() - d.startMs : 0;
        const total   = d.totalMs + live;
        const pct     = Math.round((total / maxMs) * 100);
        const isYou   = id === state.localJitsiId;
        const talking = !!d.startMs;
        return `
          <div class="pg-gd-spk-item${talking ? ' talking' : ''}">
            <div class="pg-gd-spk-name">${escHtml(d.name)}${isYou ? ' <span class="pg-gd-spk-you">You</span>' : ''}</div>
            <div class="pg-gd-spk-bar-wrap">
              <div class="pg-gd-spk-bar" style="width:${pct}%"></div>
            </div>
            <div class="pg-gd-spk-time">${formatDuration(total)}</div>
          </div>`;
      }).join('');
  }

  // ── Speech Recognition (local user only) ──────────────────
  function startSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    totalWords = 0; fillerCount = 0;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const text = e.results[i][0].transcript.toLowerCase().trim();
        if (!text) continue;
        const words = text.split(/\s+/).filter(Boolean);
        totalWords += words.length;
        const now = Date.now();
        words.forEach(w => {
          wordTimestamps.push(now);
          const clean = w.replace(/[^a-z]/g, '');
          if (clean.length > 2) uniqueWords.add(clean);
        });
        const matches = text.match(FILLER_REGEX);
        if (matches) fillerCount += matches.length;
        appendTranscript(text);
        updateConfidenceMini();
      }
    };
    rec.onerror = () => {};
    rec.onend   = () => { if (state.currentSession) { try { rec.start(); } catch {} } };
    try { rec.start(); } catch {}
    state.recognition = rec;
  }

  function calcWPM() {
    if (wordTimestamps.length < 10) return null;
    const now = Date.now();
    const recent = wordTimestamps.filter(t => now - t < 60000);
    if (recent.length < 10) {
      const elapsed = (now - wordTimestamps[0]) / 60000;
      return elapsed < 0.2 ? null : Math.round(totalWords / elapsed);
    }
    const elapsed = (now - recent[0]) / 60000;
    return elapsed < 0.1 ? null : Math.round(recent.length / elapsed);
  }

  function calcConfidenceScore() {
    if (totalWords < 15) return null;
    const fillerRate = fillerCount / totalWords;
    const fillerScore = Math.max(0, Math.min(100, 100 - fillerRate * 300));
    const wpm = calcWPM();
    if (wpm === null) return Math.round(fillerScore);
    let paceScore;
    if      (wpm < 80)   paceScore = Math.max(0, 50 + (wpm - 80) * 1.5);
    else if (wpm < 120)  paceScore = 50 + ((wpm - 80) / 40) * 50;
    else if (wpm <= 170) paceScore = 100;
    else if (wpm <= 220) paceScore = 100 - ((wpm - 170) / 50) * 30;
    else                 paceScore = Math.max(0, 70 - (wpm - 220) * 0.5);
    return Math.max(0, Math.min(100, Math.round(fillerScore * 0.65 + paceScore * 0.35)));
  }

  function updateConfidenceMini() {
    const score = calcConfidenceScore();
    if (score === null) return;
    if (confidenceMini) confidenceMini.style.display = '';
    if (confidenceValue) confidenceValue.textContent = `${score}/100`;
    const wpm = calcWPM();
    const sub = confidenceMini?.querySelector('.pg-gd-confidence-sub');
    if (sub) sub.textContent = wpm !== null ? `${wpm} WPM · filler-based` : 'Filler words & pace';
  }

  function calcVocabRichness() {
    if (totalWords < 15) return null;
    return Math.round((uniqueWords.size / totalWords) * 100);
  }

  function appendTranscript(text) {
    const highlighted = text.replace(FILLER_REGEX, '<mark class="pg-gd-filler">$&</mark>');
    transcriptEntries.push(highlighted);
    if (transcriptEntries.length > 6) transcriptEntries.shift();
    const body = document.getElementById('pgGdTranscriptBody');
    if (body) {
      body.innerHTML = transcriptEntries
        .map(t => `<div class="pg-gd-transcript-entry">${t}</div>`)
        .join('');
      body.scrollTop = body.scrollHeight;
    }
  }

  async function calibrateNoiseThreshold() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx     = new AudioContext();
      const src     = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Float32Array(analyser.frequencyBinCount);
      return new Promise(resolve => {
        const samples = [];
        const take = () => {
          analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          samples.push(rms);
          if (samples.length >= 8) {
            stream.getTracks().forEach(t => t.stop());
            ctx.close();
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            resolve(Math.min(0.18, Math.max(0.04, avg * 2.8)));
          } else {
            setTimeout(take, 200);
          }
        };
        setTimeout(take, 300);
      });
    } catch {
      return 0.06;
    }
  }

  function renderHistory(scores) {
    const el = document.getElementById('pgGdHistoryList');
    if (!el) return;
    if (!scores || scores.length === 0) {
      el.innerHTML = '<div class="pg-gd-history-empty">No previous sessions yet.</div>';
      return;
    }
    el.innerHTML = scores.map((s, i) => {
      const date = new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const conf = s.confidence_score !== null ? `${s.confidence_score}` : '—';
      const wpm  = s.wpm             !== null ? `${s.wpm} WPM`         : '';
      const part = s.participation_pct !== null ? `${s.participation_pct}%` : '—';
      return `
        <div class="pg-gd-history-row">
          <span class="pg-gd-history-num">#${scores.length - i}</span>
          <span class="pg-gd-history-date">${date}</span>
          <span class="pg-gd-history-conf" title="Confidence">${conf}</span>
          <span class="pg-gd-history-part" title="Participation">${part}</span>
          ${wpm ? `<span class="pg-gd-history-wpm">${wpm}</span>` : '<span></span>'}
        </div>`;
    }).join('');
  }

  async function loadHistory() {
    const historySection = document.getElementById('pgGdScoreHistory');
    if (!historySection) return;
    try {
      const data = await apiGet('/api/gd/sessions?type=scores');
      if (data.scores && data.scores.length > 0) {
        historySection.style.display = '';
        renderHistory(data.scores);
      }
    } catch {}
  }

  // ── My Sessions ────────────────────────────────────────────
  async function loadMySessions() {
    showStatus(mineStatus, 'loading', 'Loading your sessions…');
    try {
      const data = await apiGet('/api/gd/sessions?type=mine');
      state.mineSessions = data.sessions || [];
      renderMySessions(state.mineSessions);
      clearStatus(mineStatus);
    } catch (e) {
      renderMySessions([]);
      showStatus(mineStatus, 'error', e.message || 'Could not load your sessions.');
    }
  }

  function renderMySessions(sessions) {
    if (!sessions || sessions.length === 0) {
      mineList.innerHTML = `
        <div class="pg-gd-empty">
          <div class="pg-gd-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <strong>No sessions created yet</strong>
          <p>Sessions you create will appear here. Use "Schedule New" to create one.</p>
        </div>
      `;
      return;
    }

    mineList.innerHTML = sessions.map(s => {
      const count     = s.participant_count || 0;
      const max       = s.max_participants  || 11;
      const pct       = Math.min(100, Math.round((count / max) * 100));
      const isFull    = count >= max;
      const isActive  = s.status === 'active';
      const slotNum   = s.slot_number || '?';
      const canJoin   = !isFull && canJoinSession(s.scheduled_at);
      const countdown = !isFull && !canJoin && s.scheduled_at ? formatCountdown(s.scheduled_at) : '';
      const prog      = (s.programme || 'bda').toUpperCase();

      const statusBadge = isActive
        ? `<span class="pg-gd-card-status-active"><span class="pg-gd-live-dot"></span>Live</span>`
        : `<span class="pg-gd-card-status-waiting">Scheduled</span>`;

      return `
        <div class="pg-gd-session-card pg-gd-mine-card" data-id="${s.id}" data-scheduled="${s.scheduled_at || ''}">
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
            <button class="pg-gd-edit-session-btn" data-action="mine-edit" data-id="${s.id}">✏ Edit</button>
            <button class="pg-gd-delete-btn" data-action="mine-delete" data-id="${s.id}" title="Delete session">🗑</button>
            <button class="pg-gd-join-btn${canJoin ? ' ready' : ''}"
                    data-action="join-session" data-id="${s.id}" data-full="${isFull}"
                    ${isFull || !canJoin ? 'disabled' : ''}>
              ${isFull ? 'Full' : (canJoin ? 'Join Now →' : 'Join Session')}
            </button>
            <span class="pg-gd-join-countdown">${countdown}</span>
          </div>
          <div class="pg-gd-mine-edit-form" id="pgGdEditForm-${s.id}" style="display:none">
            <div class="pg-gd-mine-edit-inner">
              <div class="pg-gd-form-group">
                <label class="pg-gd-form-label">Topic *</label>
                <input class="pg-gd-form-input" id="pgGdEditTopic-${s.id}" type="text" maxlength="200" value="${escHtml(s.topic)}">
              </div>
              <div class="pg-gd-form-group">
                <label class="pg-gd-form-label">Context (optional)</label>
                <textarea class="pg-gd-form-textarea" id="pgGdEditDesc-${s.id}" maxlength="500" rows="2">${escHtml(s.description || '')}</textarea>
              </div>
              <div class="pg-gd-form-row">
                <div class="pg-gd-form-col">
                  <label class="pg-gd-form-label">Slot</label>
                  <select class="pg-gd-form-select" id="pgGdEditSlot-${s.id}">${slotOptions}</select>
                </div>
                <div class="pg-gd-form-col">
                  <label class="pg-gd-form-label">Date *</label>
                  <input class="pg-gd-form-input" id="pgGdEditDate-${s.id}" type="date" min="${minDate}">
                </div>
                <div class="pg-gd-form-col">
                  <label class="pg-gd-form-label">Time *</label>
                  <input class="pg-gd-form-input" id="pgGdEditTime-${s.id}" type="time">
                </div>
              </div>
              <div class="pg-gd-mine-edit-actions">
                <button class="pg-gd-create-submit" style="font-size:13px;padding:8px 18px" data-action="mine-save" data-id="${s.id}">Save Changes</button>
                <button class="pg-gd-book-cancel-btn" data-action="mine-cancel-edit" data-id="${s.id}">Cancel</button>
              </div>
              <div class="pg-gd-status" id="pgGdEditStatus-${s.id}"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Pre-fill slot selects and date/time inputs after DOM is ready
    sessions.forEach(s => {
      const slotEl = document.getElementById(`pgGdEditSlot-${s.id}`);
      const dateEl = document.getElementById(`pgGdEditDate-${s.id}`);
      const timeEl = document.getElementById(`pgGdEditTime-${s.id}`);
      if (slotEl) slotEl.value = s.slot_number || 1;
      if (s.scheduled_at) {
        const d = new Date(s.scheduled_at);
        if (dateEl) dateEl.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (timeEl) timeEl.value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
    });
  }

  async function deleteMineSession(sessionId, card) {
    if (!confirm('Delete this GD session? This cannot be undone.')) return;
    const deleteBtn = card.querySelector('[data-action="mine-delete"]');
    if (deleteBtn) deleteBtn.disabled = true;
    try {
      await apiPost('/api/gd/sessions', { action: 'delete', sessionId });
      card.style.transition = 'opacity 0.4s';
      card.style.opacity = '0';
      setTimeout(() => {
        card.remove();
        state.mineSessions = state.mineSessions.filter(s => s.id !== sessionId);
        if (mineList.querySelectorAll('.pg-gd-session-card').length === 0) renderMySessions([]);
      }, 420);
    } catch (e) {
      if (deleteBtn) deleteBtn.disabled = false;
      showStatus(mineStatus, 'error', e.message || 'Could not delete session.');
    }
  }

  async function saveEditSession(sessionId, card, saveBtn) {
    const topicEl  = document.getElementById(`pgGdEditTopic-${sessionId}`);
    const descEl   = document.getElementById(`pgGdEditDesc-${sessionId}`);
    const slotEl   = document.getElementById(`pgGdEditSlot-${sessionId}`);
    const dateEl   = document.getElementById(`pgGdEditDate-${sessionId}`);
    const timeEl   = document.getElementById(`pgGdEditTime-${sessionId}`);
    const statusEl = document.getElementById(`pgGdEditStatus-${sessionId}`);

    const topic       = topicEl?.value.trim();
    const description = descEl?.value.trim();
    const slotNumber  = parseInt(slotEl?.value) || 1;
    const date        = dateEl?.value;
    const time        = timeEl?.value;

    if (!topic) { if (statusEl) { statusEl.className = 'pg-gd-status error visible'; statusEl.textContent = 'Topic is required.'; } topicEl?.focus(); return; }
    if (!date)  { if (statusEl) { statusEl.className = 'pg-gd-status error visible'; statusEl.textContent = 'Date is required.'; }  dateEl?.focus();  return; }
    if (!time)  { if (statusEl) { statusEl.className = 'pg-gd-status error visible'; statusEl.textContent = 'Time is required.'; }  timeEl?.focus();  return; }

    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) { statusEl.className = 'pg-gd-status loading visible'; statusEl.innerHTML = '<div class="pg-gd-spinner"></div>Saving…'; }

    try {
      await apiPost('/api/gd/sessions', { action: 'update', sessionId, topic, description, slotNumber, scheduledAt });

      // Update card display without re-render
      const topicDisplay = card.querySelector('.pg-gd-card-topic');
      const schedDisplay = card.querySelector('.pg-gd-card-schedule');
      const slotDisplay  = card.querySelector('.pg-gd-slot-badge');
      const descDisplay  = card.querySelector('.pg-gd-card-desc');
      if (topicDisplay) topicDisplay.textContent = topic;
      if (schedDisplay) schedDisplay.textContent = `📅 ${formatScheduledAt(scheduledAt)}`;
      if (slotDisplay)  slotDisplay.textContent  = `GD SLOT-${slotNumber}`;
      if (descDisplay && description) { descDisplay.textContent = description.slice(0, 100) + (description.length > 100 ? '…' : ''); }
      card.dataset.scheduled = scheduledAt;

      const sess = state.mineSessions.find(s => s.id === sessionId);
      if (sess) { sess.topic = topic; sess.description = description; sess.slot_number = slotNumber; sess.scheduled_at = scheduledAt; }

      const form = document.getElementById(`pgGdEditForm-${sessionId}`);
      if (form) form.style.display = 'none';
      if (statusEl) { statusEl.className = 'pg-gd-status'; statusEl.textContent = ''; }
    } catch (e) {
      if (statusEl) { statusEl.className = 'pg-gd-status error visible'; statusEl.textContent = e.message || 'Could not save changes.'; }
      if (saveBtn) saveBtn.disabled = false;
    }
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

  // ── Participants panel ─────────────────────────────────────
  async function toggleParticipants(sessionId, card) {
    const panel = document.getElementById(`pgGdPtList-${sessionId}`);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    const chevron = card.querySelector('.pg-gd-slot-chevron');
    if (isOpen) {
      panel.style.display = 'none';
      if (chevron) chevron.textContent = '▾';
      return;
    }
    panel.style.display = '';
    if (chevron) chevron.textContent = '▴';
    if (state.participantsCache[sessionId]) {
      renderParticipants(state.participantsCache[sessionId], panel);
      return;
    }
    panel.innerHTML = '<div class="pg-gd-pt-loading">Loading participants…</div>';
    try {
      const data = await apiGet(`/api/gd/sessions?type=participants&sessionId=${sessionId}`);
      state.participantsCache[sessionId] = data.participants || [];
      renderParticipants(state.participantsCache[sessionId], panel);
    } catch {
      panel.innerHTML = '<div class="pg-gd-pt-loading" style="color:#dc2626">Failed to load participants.</div>';
    }
  }

  function renderParticipants(participants, panel) {
    if (!participants || participants.length === 0) {
      panel.innerHTML = '<div class="pg-gd-pt-empty">No one has booked this session yet. Be the first!</div>';
      return;
    }
    panel.innerHTML = `
      <div class="pg-gd-pt-list">
        <div class="pg-gd-pt-header">
          <span>#</span><span>Name</span><span>Roll No.</span><span>Programme</span>
        </div>
        ${participants.map((p, i) => `
          <div class="pg-gd-pt-row">
            <span class="pg-gd-pt-num">${i + 1}</span>
            <span>${escHtml(p.participant_name || '—')}</span>
            <span>${escHtml(p.participant_roll || '—')}</span>
            <span>${escHtml(p.participant_programme || '—')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Book Session ───────────────────────────────────────────
  function showBookForm(sessionId, card) {
    const form = document.getElementById(`pgGdBookForm-${sessionId}`);
    if (!form) return;
    form.style.display = '';
    const bookBtn = card.querySelector('[data-action="show-book-form"]');
    if (bookBtn) bookBtn.style.display = 'none';
    const nameInput = document.getElementById(`pgGdBookName-${sessionId}`);
    if (nameInput) nameInput.focus();
  }

  function cancelBooking(sessionId, card) {
    const form = document.getElementById(`pgGdBookForm-${sessionId}`);
    if (form) form.style.display = 'none';
    const bookBtn = card.querySelector('[data-action="show-book-form"]');
    if (bookBtn) bookBtn.style.display = '';
  }

  async function confirmBooking(sessionId, card) {
    const nameInput  = document.getElementById(`pgGdBookName-${sessionId}`);
    const rollInput  = document.getElementById(`pgGdBookRoll-${sessionId}`);
    const progInput  = document.getElementById(`pgGdBookProg-${sessionId}`);
    const statusEl   = card.querySelector('.pg-gd-book-form-status');
    const confirmBtn = card.querySelector('[data-action="confirm-book"]');

    const participantName      = nameInput?.value.trim();
    const participantRoll      = rollInput?.value.trim();
    const participantProgramme = progInput?.value.trim() || state.currentProgramme.toUpperCase();

    if (!participantName) { if (statusEl) statusEl.textContent = 'Please enter your name.'; nameInput?.focus(); return; }
    if (!participantRoll) { if (statusEl) statusEl.textContent = 'Please enter your roll number.'; rollInput?.focus(); return; }

    if (confirmBtn) confirmBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Booking…';

    try {
      const data = await apiPost('/api/gd/sessions', {
        action: 'book',
        sessionId,
        participantName,
        participantRoll,
        participantProgramme
      });

      localStorage.setItem(`gd_booked_${sessionId}`, '1');
      delete state.participantsCache[sessionId];

      const form = document.getElementById(`pgGdBookForm-${sessionId}`);
      if (form) form.style.display = 'none';

      const joinCol = card.querySelector('.pg-gd-join-col');
      const bookBtn = joinCol?.querySelector('[data-action="show-book-form"]');
      if (bookBtn) bookBtn.outerHTML = `<span class="pg-gd-booked-badge">✓ Booked</span>`;

      if (!data.alreadyBooked && data.newCount !== undefined) {
        const countEl = card.querySelector('.pg-gd-participant-count');
        const max = parseInt(countEl?.textContent?.split('/')[1]) || 11;
        if (countEl) countEl.textContent = `${data.newCount}/${max} participants`;
        const fillEl = card.querySelector('.pg-gd-bar-fill');
        if (fillEl) fillEl.style.width = `${Math.min(100, Math.round((data.newCount / max) * 100))}%`;
        const sess = state.sessions.find(s => s.id === sessionId);
        if (sess) sess.participant_count = data.newCount;
      }

      // refresh participants panel if open
      const panel = document.getElementById(`pgGdPtList-${sessionId}`);
      if (panel && panel.style.display !== 'none') {
        panel.innerHTML = '<div class="pg-gd-pt-loading">Refreshing…</div>';
        try {
          const fresh = await apiGet(`/api/gd/sessions?type=participants&sessionId=${sessionId}`);
          state.participantsCache[sessionId] = fresh.participants || [];
          renderParticipants(state.participantsCache[sessionId], panel);
        } catch {}
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Could not book. Try again.';
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  // ── Delete Session ─────────────────────────────────────────
  async function confirmDeleteSession(sessionId, card) {
    if (!confirm('Delete this GD session? This cannot be undone.')) return;
    const deleteBtn = card.querySelector('[data-action="delete-session"]');
    if (deleteBtn) deleteBtn.disabled = true;
    try {
      await apiPost('/api/gd/sessions', { action: 'delete', sessionId });
      card.style.transition = 'opacity 0.4s';
      card.style.opacity = '0';
      setTimeout(() => {
        card.remove();
        state.sessions = state.sessions.filter(s => s.id !== sessionId);
        if (sessionsList.querySelectorAll('.pg-gd-session-card').length === 0) renderSessions([]);
      }, 420);
    } catch (e) {
      if (deleteBtn) deleteBtn.disabled = false;
      showStatus(lobbyStatus, 'error', e.message || 'Could not delete session.');
    }
  }

  // ── Join a session ─────────────────────────────────────────
  function joinSession(sessionId) {
    const session = state.sessions.find(s => s.id === sessionId) ||
                    state.mineSessions.find(s => s.id === sessionId);
    if (!session) { showStatus(lobbyStatus, 'error', 'Session not found. Please refresh.'); return; }
    stopCountdownUpdates();
    clearStatus(lobbyStatus);
    enterSessionView(session);
  }

  // ── Enter session view ────────────────────────────────────
  async function enterSessionView(session) {
    state.currentSession     = session;
    state.speakingData       = {};
    state.audioSpeakingState = {};
    state.dominantId         = null;
    state.localJitsiId       = null;
    state.speakingTurns      = 0;
    state.interruptionCount  = 0;
    totalWords = 0; fillerCount = 0; wordTimestamps = [];
    uniqueWords = new Set(); transcriptEntries = [];

    enterView('session');

    sessionTopicEl.textContent   = session.topic;
    sessionSlotEl.textContent    = session.slot_number ? `GD SLOT-${session.slot_number}` : 'GD Session';
    participantCount.textContent = `${session.participant_count}/${session.max_participants}`;
    participantList.innerHTML    = '<div class="pg-gd-spk-empty">Loading video room…</div>';
    if (confidenceMini) confidenceMini.style.display = 'none';

    state.timerStart = Date.now();
    startTimer();
    state.speakingInterval = setInterval(renderSpeakingTimes, 1000);
    state.pollInterval = setInterval(() => refreshParticipantCount(session.id), 10000);

    audioThreshold = await calibrateNoiseThreshold();
    await loadJitsiScript();
    initJitsi(session);
    startSpeechRecognition();
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
      timerDisplay.textContent = formatDuration(Date.now() - state.timerStart);
    }, 1000);
  }
  function clearTimerInterval()    { if (state.timerInterval)    { clearInterval(state.timerInterval);    state.timerInterval    = null; } }
  function clearPollInterval()     { if (state.pollInterval)     { clearInterval(state.pollInterval);     state.pollInterval     = null; } }
  function clearSpeakingInterval() { if (state.speakingInterval) { clearInterval(state.speakingInterval); state.speakingInterval = null; } }

  // ── Leave session ─────────────────────────────────────────
  async function leaveSession() {
    if (!state.currentSession) return;
    showStatus(sessionStatus, 'loading', 'Leaving session…');
    const sessionId = state.currentSession.id;
    const elapsed   = Date.now() - state.timerStart;

    // Flush all currently-speaking participants
    const flushNow = Date.now();
    Object.values(state.speakingData).forEach(d => {
      if (d.startMs) { d.totalMs += flushNow - d.startMs; d.startMs = null; }
    });
    // Clear audio grace timers
    Object.values(state.audioSpeakingState).forEach(s => { if (s.graceTimer) clearTimeout(s.graceTimer); });

    // Calculate scores before cleanup
    const confScore  = calcConfidenceScore();
    const myData     = state.speakingData[state.localJitsiId];
    const totalSpk   = Object.values(state.speakingData).reduce((a, d) => a + d.totalMs, 0);
    const mySpk      = myData?.totalMs || 0;
    const myWpm      = calcWPM();
    const partPct    = totalSpk > 0 ? Math.round((mySpk / totalSpk) * 100) : null;
    const vocabScore = calcVocabRichness();
    const turns      = state.speakingTurns;
    const interrupts = state.interruptionCount;
    const savedSessionId = state.currentSession.id;

    // Dispose Jitsi
    if (state.jitsiApi) { try { state.jitsiApi.dispose(); } catch {} state.jitsiApi = null; }
    // Stop speech recognition
    if (state.recognition) { try { state.recognition.stop(); } catch {} state.recognition = null; }

    try {
      await apiPost('/api/gd/sessions', { action: 'leave', sessionId });
      clearTimerInterval();
      clearPollInterval();
      clearSpeakingInterval();
      state.currentSession     = null;
      state.speakingData       = {};
      state.audioSpeakingState = {};
      state.localJitsiId       = null;

      feedbackDuration.textContent = formatDuration(elapsed);

      if (feedbackConfidence) {
        feedbackConfidence.textContent = confScore !== null ? `${confScore}` : '—';
        const lbl = document.getElementById('pgGdFeedbackConfidenceLabel');
        if (lbl && confScore !== null) {
          const wpmNote = myWpm !== null ? ` · ${myWpm} WPM` : '';
          lbl.textContent = confScore >= 75 ? `Great — minimal fillers${wpmNote}` :
                            confScore >= 50 ? `Good — reduce filler words${wpmNote}` :
                                             `Needs work — too many fillers${wpmNote}`;
        }
      }
      if (feedbackParticipation) {
        feedbackParticipation.textContent = partPct !== null ? `${partPct}%` : '—';
        const lbl = document.getElementById('pgGdFeedbackParticipationLabel');
        if (lbl && mySpk > 0) lbl.textContent = `${formatDuration(mySpk)} of your speaking time`;
      }

      const turnsEl = document.getElementById('pgGdFeedbackTurns');
      if (turnsEl) {
        turnsEl.textContent = turns > 0 ? `${turns}` : '—';
        const lbl = document.getElementById('pgGdFeedbackTurnsLabel');
        if (lbl && turns > 0) {
          lbl.textContent = interrupts > 0
            ? `${turns} turns · ${interrupts} overlap${interrupts > 1 ? 's' : ''}`
            : `${turns} speaking contributions`;
        }
      }

      const vocabEl = document.getElementById('pgGdFeedbackVocab');
      if (vocabEl) {
        vocabEl.textContent = vocabScore !== null ? `${vocabScore}%` : '—';
        const lbl = document.getElementById('pgGdFeedbackVocabLabel');
        if (lbl && vocabScore !== null) {
          lbl.textContent = vocabScore >= 65 ? 'Rich — varied vocabulary' :
                            vocabScore >= 45 ? 'Moderate — some repetition' :
                                              'Low — try more varied words';
        }
      }

      // Save score to Supabase (best-effort, don't block UI)
      apiPost('/api/gd/sessions', {
        action:             'save-score',
        sessionId:          savedSessionId,
        programme:          state.currentProgramme,
        confidenceScore:    confScore,
        wpm:                myWpm,
        participationPct:   partPct,
        speakingTurns:      turns,
        vocabularyRichness: vocabScore,
        interruptions:      interrupts,
        elapsedMs:          elapsed
      }).catch(() => {});

      showEndedFeedback();
      loadHistory();
    } catch (e) {
      showStatus(sessionStatus, 'error', e.message || 'Could not leave. Try again.');
    }
  }

  function showEndedFeedback() { enterView('feedback'); }

  // ── Create / schedule session ──────────────────────────────
  async function createSession() {
    const creatorName = creatorNameInput.value.trim();
    const topic       = topicInput.value.trim();
    const date        = dateInput.value;
    const time        = timeInput.value;

    if (!creatorName) { showStatus(createStatus, 'error', 'Please enter your name.'); creatorNameInput.focus(); return; }
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
        scheduledAt,
        creatorName
      });

      showStatus(createStatus, 'success',
        `✓ GD SLOT-${slotNum} scheduled for ${formatScheduledAt(scheduledAt)}. Join opens 15 min before the session.`);

      creatorNameInput.value = '';
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

  // Mine list event delegation
  mineList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    const card   = btn.closest('.pg-gd-session-card');

    if (action === 'mine-edit') {
      const form = document.getElementById(`pgGdEditForm-${id}`);
      if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
      return;
    }
    if (action === 'mine-cancel-edit') {
      const form = document.getElementById(`pgGdEditForm-${id}`);
      if (form) form.style.display = 'none';
      return;
    }
    if (action === 'mine-save')   return saveEditSession(id, card, btn);
    if (action === 'mine-delete') return deleteMineSession(id, card);
    if (action === 'join-session' && !btn.disabled && btn.dataset.full !== 'true') joinSession(id);
  });

  mineRefreshBtn.addEventListener('click', () => { clearStatus(mineStatus); loadMySessions(); });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (state.currentSession) return;
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'lobby')  loadSessions();
      if (tab.dataset.tab === 'create') populateTopicSuggestions(state.currentProgramme);
      if (tab.dataset.tab === 'mine')   loadMySessions();
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
    if (confirm('Leave the discussion session?')) leaveSession();
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
