(function initJdMatcher() {
  const CIRCUMFERENCE = 2 * Math.PI * 44;

  // ── Build DOM ──────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'pg-jd-wrap';
  wrap.innerHTML = `
    <button class="pg-jd-trigger" type="button" aria-label="Open JD-CV Match Analyzer">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="10" rx="1.5"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="13" y="3" width="8" height="10" rx="1.5"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 17h10M7 20h6"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M11 8h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <span class="pg-jd-tip" aria-hidden="true">JD Match Analyzer</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'pg-jd-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'JD-CV Match Analyzer');
  overlay.innerHTML = `
    <div class="pg-jd-modal">
      <div class="pg-jd-head">
        <div class="pg-jd-head-icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="8" height="10" rx="1.5"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="13" y="3" width="8" height="10" rx="1.5"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 17h10M7 20h6"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M11 8h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="pg-jd-head-text">
          <strong>JD Match Analyzer</strong>
          <span id="pgJdScope">Programme-aware JD vs CV scoring &amp; gap analysis</span>
        </div>
        <button class="pg-jd-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="pg-jd-body" id="pgJdBody">

        <!-- Form view -->
        <div id="pgJdFormView">
          <div class="pg-jd-panels">
            <!-- JD panel -->
            <div>
              <div class="pg-jd-panel-label">
                <div class="pg-jd-panel-label-dot jd"></div>
                Job Description
              </div>
              <div class="pg-jd-upload-row">
                <input class="pg-jd-file jd-file" id="pgJdJdFile" type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
              </div>
              <div class="pg-jd-upload-status" id="pgJdJdUploadStatus"></div>
              <textarea class="pg-jd-textarea jd-focus" id="pgJdJdText" maxlength="60000"
                placeholder="Upload a PDF/DOCX JD file to extract text automatically, or paste the job description here."></textarea>
              <div class="pg-jd-charcount"><span id="pgJdJdChars">0</span> / 60,000</div>
            </div>

            <!-- CV panel -->
            <div>
              <div class="pg-jd-panel-label">
                <div class="pg-jd-panel-label-dot cv"></div>
                Your CV / Resume
              </div>
              <div class="pg-jd-upload-row">
                <input class="pg-jd-file" id="pgJdCvFile" type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
              </div>
              <div class="pg-jd-upload-status" id="pgJdUploadStatus"></div>
              <textarea class="pg-jd-textarea" id="pgJdCvText" maxlength="60000"
                placeholder="Upload a PDF/DOCX CV to extract text automatically, or paste your resume text here."></textarea>
              <div class="pg-jd-charcount"><span id="pgJdCvChars">0</span> / 60,000</div>
            </div>
          </div>

          <div class="pg-jd-form-foot">
            <span class="pg-jd-form-note">Minimum 200 characters in each field to run analysis</span>
            <button class="pg-jd-btn-primary" id="pgJdSubmit" type="button" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Analyze Match
            </button>
          </div>
          <div id="pgJdError" style="display:none"></div>
        </div>

        <!-- Loading view -->
        <div id="pgJdLoadingView" style="display:none">
          <div class="pg-jd-loading">
            <div class="pg-jd-spinner"></div>
            <p>Analyzing JD-CV match against ${'<span id="pgJdLoadProg"></span>'} standards&hellip;<br>We are carefully reading both documents. This takes a few seconds.</p>
          </div>
        </div>

        <!-- Results view -->
        <div id="pgJdResultsView" style="display:none"></div>

      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Element refs ───────────────────────────────────────────────
  const trigger         = wrap.querySelector('.pg-jd-trigger');
  const closeBtn        = overlay.querySelector('.pg-jd-close-btn');
  const scopeEl         = overlay.querySelector('#pgJdScope');
  const jdTextarea      = overlay.querySelector('#pgJdJdText');
  const cvTextarea      = overlay.querySelector('#pgJdCvText');
  const jdFileInput     = overlay.querySelector('#pgJdJdFile');
  const cvFileInput     = overlay.querySelector('#pgJdCvFile');
  const jdUploadStatus  = overlay.querySelector('#pgJdJdUploadStatus');
  const uploadStatus    = overlay.querySelector('#pgJdUploadStatus');
  const jdCharsEl       = overlay.querySelector('#pgJdJdChars');
  const cvCharsEl       = overlay.querySelector('#pgJdCvChars');
  const submitBtn       = overlay.querySelector('#pgJdSubmit');
  const errorEl         = overlay.querySelector('#pgJdError');
  const formView        = overlay.querySelector('#pgJdFormView');
  const loadView        = overlay.querySelector('#pgJdLoadingView');
  const resView         = overlay.querySelector('#pgJdResultsView');

  // ── Event wiring ───────────────────────────────────────────────
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  document.addEventListener('placement:programme-change', updateScope);
  setInterval(updateScope, 800);

  jdTextarea.addEventListener('input', updateFormState);
  cvTextarea.addEventListener('input', updateFormState);
  jdFileInput.addEventListener('change', handleJdUpload);
  cvFileInput.addEventListener('change', handleCvUpload);
  submitBtn.addEventListener('click', runAnalysis);

  function open() {
    if (!isProgrammeViewActive()) return;
    overlay.classList.add('open');
    updateScope();
    setTimeout(() => jdTextarea.focus(), 60);
  }

  function close() { overlay.classList.remove('open'); }

  function showView(name) {
    formView.style.display  = name === 'form'    ? '' : 'none';
    loadView.style.display  = name === 'loading' ? '' : 'none';
    resView.style.display   = name === 'results' ? '' : 'none';
  }

  function updateFormState() {
    jdCharsEl.textContent = jdTextarea.value.length.toLocaleString();
    cvCharsEl.textContent = cvTextarea.value.length.toLocaleString();
    submitBtn.disabled = jdTextarea.value.trim().length < 200 || cvTextarea.value.trim().length < 200;
  }

  async function handleJdUpload() {
    const file = jdFileInput.files?.[0];
    if (!file) return;

    jdUploadStatus.textContent = 'Extracting JD text…';
    jdFileInput.disabled = true;
    submitBtn.disabled = true;

    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in before uploading a file.');
      const payload = await window.PlacementResumeUpload.extractResumeFile(file, token);
      jdTextarea.value = payload.text;
      updateFormState();
      jdUploadStatus.textContent = `Extracted ${payload.characters.toLocaleString()} characters.`;
    } catch (err) {
      jdUploadStatus.textContent = 'Upload failed.';
      showError(err.message || 'Could not extract this file.');
    } finally {
      jdFileInput.disabled = false;
    }
  }

  async function handleCvUpload() {
    const file = cvFileInput.files?.[0];
    if (!file) return;

    uploadStatus.textContent = 'Extracting CV text…';
    cvFileInput.disabled = true;
    submitBtn.disabled = true;

    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in before uploading a CV.');
      const payload = await window.PlacementResumeUpload.extractResumeFile(file, token);
      cvTextarea.value = payload.text;
      updateFormState();
      uploadStatus.textContent = `Extracted ${payload.characters.toLocaleString()} characters.`;
    } catch (err) {
      uploadStatus.textContent = 'Upload failed.';
      showError(err.message || 'Could not extract this file.');
    } finally {
      cvFileInput.disabled = false;
    }
  }

  function updateScope() {
    const active = isProgrammeViewActive();
    wrap.hidden = !active;
    if (!active) {
      overlay.classList.remove('open');
      if (scopeEl) scopeEl.textContent = 'Select a programme to enable JD matching';
      return;
    }
    const code = getProgrammeCode();
    if (scopeEl) scopeEl.textContent = code
      ? `${code.toUpperCase()} scoped JD vs CV scoring & gap analysis`
      : 'Select a programme to enable JD matching';
  }

  // ── Analysis ───────────────────────────────────────────────────
  async function runAnalysis() {
    const jdText    = jdTextarea.value.trim();
    const cvText    = cvTextarea.value.trim();
    const programme = getProgrammeCode();

    errorEl.style.display = 'none';

    if (jdText.length < 200) { showError('Please paste the full job description (at least 200 characters).'); return; }
    if (cvText.length < 200) { showError('Please paste or upload your CV text (at least 200 characters).'); return; }

    const token = await getToken();
    if (!token) { showError('Please sign in before using the JD Match Analyzer.'); return; }

    const loadProg = overlay.querySelector('#pgJdLoadProg');
    if (loadProg) loadProg.textContent = programme ? programme.toUpperCase() : 'MBA';

    showView('loading');

    try {
      const res = await fetch('/api/ai/jd-match', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText, cvText, programme })
      });

      let payload;
      try {
        payload = await res.json();
      } catch {
        throw new Error('Server returned an unexpected response. Please try again in a moment.');
      }

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'Analysis failed. Please try again.');
      }

      renderResults(payload);
      showView('results');
    } catch (err) {
      showView('form');
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  function showError(msg) {
    errorEl.style.display = '';
    errorEl.innerHTML = `<div class="pg-jd-error-box">${esc(msg)}</div>`;
  }

  // ── Results rendering ──────────────────────────────────────────
  function renderResults(data) {
    const score  = data.matchScore;
    const bd     = data.scoreBreakdown || {};
    const color  = score >= 75 ? '#059669' : score >= 55 ? '#d97706' : '#dc2626';
    const filled = (score / 100) * CIRCUMFERENCE;
    const gap    = CIRCUMFERENCE - filled;

    const verdictClass = {
      'Strong Fit': 'strong',
      'Good Fit':   'good',
      'Borderline': 'border',
      'Weak Fit':   'weak'
    }[data.shortlistVerdict] || 'border';

    const verdictIcon = {
      'Strong Fit': '✓',
      'Good Fit':   '↑',
      'Borderline': '~',
      'Weak Fit':   '↓'
    }[data.shortlistVerdict] || '~';

    const barDefs = [
      { name: 'Skills Match',  key: 'skillsMatch' },
      { name: 'Role Alignment',key: 'roleAlignment' },
      { name: 'Keywords ATS',  key: 'keywordsMatch' },
      { name: 'Experience',    key: 'experienceMatch' },
      { name: 'Education Fit', key: 'educationFit' }
    ];

    const barsHtml = barDefs.map(({ name, key }) => {
      const v   = bd[key] ?? 0;
      const cls = v >= 70 ? '' : v >= 45 ? ' amber' : ' red';
      return `
        <div class="pg-jd-bar-row">
          <span class="pg-jd-bar-name">${name}</span>
          <div class="pg-jd-bar-track">
            <div class="pg-jd-bar-fill${cls}" data-target="${v}" style="width:0%"></div>
          </div>
          <span class="pg-jd-bar-val">${v}</span>
        </div>`;
    }).join('');

    const strongHtml = (data.strongPoints || []).map(p =>
      `<div class="pg-jd-point strong"><span class="pg-jd-point-icon">✓</span><span>${esc(p)}</span></div>`
    ).join('');

    const weakHtml = (data.weakPoints || []).map(p =>
      `<div class="pg-jd-point weak"><span class="pg-jd-point-icon">✗</span><span>${esc(p)}</span></div>`
    ).join('');

    const suggestHtml = (data.suggestions || []).map(p =>
      `<div class="pg-jd-point suggest"><span class="pg-jd-point-icon">→</span><span>${esc(p)}</span></div>`
    ).join('');

    const addTagsHtml = (data.keywordsToAdd || []).map(k =>
      `<span class="pg-jd-tag add">${esc(k)}</span>`
    ).join('');

    const matchedTagsHtml = (data.matchedKeywords || []).map(k =>
      `<span class="pg-jd-tag matched">${esc(k)}</span>`
    ).join('');

    const progLabel = (data.programme || 'MBA').toUpperCase();

    resView.innerHTML = `
      <!-- Match score hero -->
      <div class="pg-jd-hero">
        <div class="pg-jd-gauge">
          <svg width="108" height="108" viewBox="0 0 110 110" aria-hidden="true">
            <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(31,41,51,0.08)" stroke-width="10"/>
            <circle cx="55" cy="55" r="44" fill="none" stroke="${color}" stroke-width="10"
              stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}"
              stroke-linecap="round" transform="rotate(-90 55 55)"/>
            <text x="55" y="59" text-anchor="middle" font-size="22" font-weight="900"
              fill="${color}" font-family="inherit">${score}%</text>
            <text x="55" y="73" text-anchor="middle" font-size="9" fill="#7b8794"
              font-family="inherit">match</text>
          </svg>
        </div>
        <div class="pg-jd-score-block">
          <div class="pg-jd-score-num" style="color:${color}">${score}<span style="font-size:16px;font-weight:500;color:#7b8794">%</span></div>
          <div class="pg-jd-score-sub">JD-CV Match Score — ${progLabel} scoped</div>
          <div class="pg-jd-verdict-badge ${verdictClass}">
            <span>${verdictIcon}</span> ${esc(data.shortlistVerdict)}
          </div>
          ${data.verdictReason ? `<div class="pg-jd-verdict-reason">${esc(data.verdictReason)}</div>` : ''}
        </div>
      </div>

      <!-- Top priority action -->
      ${data.topPriorityAction ? `
      <div class="pg-jd-priority">
        <div class="pg-jd-priority-icon">⚡</div>
        <div class="pg-jd-priority-body">
          <div class="pg-jd-priority-label">Top Priority Action</div>
          <div class="pg-jd-priority-text">${esc(data.topPriorityAction)}</div>
        </div>
      </div>` : ''}

      <!-- Score breakdown -->
      <div class="pg-jd-section">Score Breakdown</div>
      <div class="pg-jd-bars">${barsHtml}</div>

      <!-- Strong points -->
      ${strongHtml ? `
      <div class="pg-jd-section">Strong Points — What Works in Your Favour</div>
      <div class="pg-jd-points">${strongHtml}</div>` : ''}

      <!-- Weak points -->
      ${weakHtml ? `
      <div class="pg-jd-section">Gaps — What the JD Requires but CV Lacks</div>
      <div class="pg-jd-points">${weakHtml}</div>` : ''}

      <!-- Suggestions -->
      ${suggestHtml ? `
      <div class="pg-jd-section">Suggestions to Improve Your Match</div>
      <div class="pg-jd-points">${suggestHtml}</div>` : ''}

      <!-- Keywords to add -->
      ${addTagsHtml ? `
      <div class="pg-jd-section">Keywords to Add to Your CV <span style="font-weight:400;text-transform:none;font-size:10px;color:#9aa5b1">(exact phrases from JD — add these to pass ATS filters)</span></div>
      <div class="pg-jd-tags">${addTagsHtml}</div>` : ''}

      <!-- Matched keywords -->
      ${matchedTagsHtml ? `
      <div class="pg-jd-section">Already Matched Keywords <span style="font-weight:400;text-transform:none;font-size:10px;color:#9aa5b1">(present in both JD and CV)</span></div>
      <div class="pg-jd-tags">${matchedTagsHtml}</div>` : ''}

      <div class="pg-jd-result-foot">
        <button class="pg-jd-btn-secondary" id="pgJdReset">Analyze Another JD</button>
      </div>
    `;

    resView.querySelector('#pgJdReset').addEventListener('click', resetForm);

    requestAnimationFrame(() => {
      resView.querySelectorAll('.pg-jd-bar-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    });
  }

  function resetForm() {
    jdTextarea.value = '';
    cvTextarea.value = '';
    jdFileInput.value = '';
    cvFileInput.value = '';
    jdUploadStatus.textContent = '';
    uploadStatus.textContent = '';
    jdCharsEl.textContent = '0';
    cvCharsEl.textContent = '0';
    submitBtn.disabled = true;
    errorEl.style.display = 'none';
    showView('form');
  }

  // ── Helpers ────────────────────────────────────────────────────
  function getProgrammeCode() {
    if (typeof window.selectedProg === 'string' && window.selectedProg) return window.selectedProg;
    const pill = document.getElementById('progPillName')?.textContent?.trim().toLowerCase();
    if (pill && pill !== 'programme') return pill;
    return null;
  }

  function isProgrammeViewActive() {
    const app = document.getElementById('mainApp');
    const nav = document.getElementById('mainNav');
    const appVisible = !!app && app.classList.contains('show') && app.style.display !== 'none';
    const navVisible = !!nav && nav.style.display !== 'none';
    return appVisible && navVisible && !!getProgrammeCode();
  }

  async function getToken() {
    if (!window.sbIndex?.auth?.getSession) return null;
    const { data } = await window.sbIndex.auth.getSession();
    return data?.session?.access_token || null;
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  updateScope();
})();
