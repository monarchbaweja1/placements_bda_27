(function initPlacementResumeAnalyzer() {
  const CIRCUMFERENCE = 2 * Math.PI * 44;

  // ── Build DOM ──────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'pg-ra-wrap';
  wrap.innerHTML = `
    <button class="pg-ra-trigger" type="button" aria-label="Open Resume Analyzer">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 2v6h6M9 13h6M9 17h4"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <span class="pg-ra-tip" aria-hidden="true">Resume Analyzer</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'pg-ra-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Resume Analyzer');
  overlay.innerHTML = `
    <div class="pg-ra-modal">
      <div class="pg-ra-head">
        <div class="pg-ra-head-icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 2v6h6M9 13h6M9 17h4"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="pg-ra-head-text">
          <strong>Resume Analyzer</strong>
          <span id="pgRaScope">Programme-aware ATS scoring &amp; recommendations</span>
        </div>
        <button class="pg-ra-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="pg-ra-body" id="pgRaBody">
        <!-- Form view -->
        <div id="pgRaFormView">
          <div class="pg-ra-upload-row">
            <div>
              <label class="pg-ra-field-label" for="pgRaFile">Upload CV</label>
              <input class="pg-ra-file" id="pgRaFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
            </div>
            <div class="pg-ra-upload-meta">
              <strong id="pgRaFileName">PDF, DOCX, or TXT</strong>
              <span id="pgRaUploadStatus">Upload a CV or paste text below.</span>
            </div>
          </div>

          <label class="pg-ra-field-label" for="pgRaText">Paste or extracted resume text</label>
          <textarea class="pg-ra-textarea" id="pgRaText" maxlength="80000"
            placeholder="Upload a PDF/DOCX CV to extract text automatically, or paste your resume text here."></textarea>
          <div class="pg-ra-charcount"><span id="pgRaChars">0</span>&nbsp;/ 80,000 characters</div>

          <div class="pg-ra-grid">
            <div>
              <label class="pg-ra-field-label" for="pgRaRole">Target Role <span style="font-weight:400;text-transform:none;font-size:10px">(optional)</span></label>
              <input class="pg-ra-input" id="pgRaRole" type="text" placeholder="e.g. Data Analyst" maxlength="120">
            </div>
            <div>
              <label class="pg-ra-field-label" for="pgRaCompany">Target Company <span style="font-weight:400;text-transform:none;font-size:10px">(optional)</span></label>
              <input class="pg-ra-input" id="pgRaCompany" type="text" placeholder="e.g. Deloitte" maxlength="120">
            </div>
          </div>

          <div class="pg-ra-form-foot">
            <span class="pg-ra-form-note">Minimum 500 characters required for analysis</span>
            <button class="pg-ra-btn-primary" id="pgRaSubmit" type="button" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Analyze Resume
            </button>
          </div>
          <div id="pgRaError" style="display:none"></div>
        </div>

        <!-- Loading view -->
        <div id="pgRaLoadingView" style="display:none">
          <div class="pg-ra-loading">
            <div class="pg-ra-spinner"></div>
            <p>Analyzing your resume against programme requirements&hellip;<br>This takes a few seconds.</p>
          </div>
        </div>

        <!-- Results view -->
        <div id="pgRaResultsView" style="display:none"></div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Element refs ───────────────────────────────────────────────
  const trigger   = wrap.querySelector('.pg-ra-trigger');
  const closeBtn  = overlay.querySelector('.pg-ra-close-btn');
  const fileInput = overlay.querySelector('#pgRaFile');
  const fileNameEl = overlay.querySelector('#pgRaFileName');
  const uploadStatusEl = overlay.querySelector('#pgRaUploadStatus');
  const textarea  = overlay.querySelector('#pgRaText');
  const charEl    = overlay.querySelector('#pgRaChars');
  const roleInput = overlay.querySelector('#pgRaRole');
  const compInput = overlay.querySelector('#pgRaCompany');
  const submitBtn = overlay.querySelector('#pgRaSubmit');
  const errorEl   = overlay.querySelector('#pgRaError');
  const scopeEl   = overlay.querySelector('#pgRaScope');
  const formView  = overlay.querySelector('#pgRaFormView');
  const loadView  = overlay.querySelector('#pgRaLoadingView');
  const resView   = overlay.querySelector('#pgRaResultsView');

  // ── Interaction ────────────────────────────────────────────────
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  document.addEventListener('placement:programme-change', updateScope);
  setInterval(updateScope, 800);

  textarea.addEventListener('input', () => {
    updateTextState();
  });
  roleInput.addEventListener('input', updateScope);
  compInput.addEventListener('input', updateScope);
  fileInput.addEventListener('change', handleFileUpload);

  submitBtn.addEventListener('click', runAnalysis);

  function open() {
    if (!isProgrammeViewActive()) return;
    overlay.classList.add('open');
    updateScope();
    setTimeout(() => textarea.focus(), 60);
  }

  function close() { overlay.classList.remove('open'); }

  function showView(name) {
    formView.style.display  = name === 'form'    ? '' : 'none';
    loadView.style.display  = name === 'loading' ? '' : 'none';
    resView.style.display   = name === 'results' ? '' : 'none';
  }

  async function handleFileUpload() {
    const file = fileInput.files?.[0];
    if (!file) return;

    errorEl.style.display = 'none';
    fileNameEl.textContent = file.name;
    uploadStatusEl.textContent = 'Extracting resume text...';
    fileInput.disabled = true;
    submitBtn.disabled = true;

    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in before uploading a resume.');
      const payload = await window.PlacementResumeUpload.extractResumeFile(file, token);
      textarea.value = payload.text;
      updateTextState();
      uploadStatusEl.textContent = `Extracted ${payload.characters.toLocaleString()} characters. Review before analyzing.`;
    } catch (err) {
      uploadStatusEl.textContent = 'Upload failed.';
      showError(err.message || 'Could not extract this resume.');
    } finally {
      fileInput.disabled = false;
    }
  }

  function updateTextState() {
    const len = textarea.value.length;
    charEl.textContent = len.toLocaleString();
    submitBtn.disabled = len < 500;
  }

  function updateScope() {
    const active = isProgrammeViewActive();
    wrap.hidden = !active;
    if (!active) {
      overlay.classList.remove('open');
      if (scopeEl) scopeEl.textContent = 'Select a programme before analyzing';
      return;
    }

    const role = roleInput?.value.trim();
    const company = compInput?.value.trim();
    if (scopeEl) {
      if (role && company) {
        scopeEl.textContent = `Analyzing for: ${role} @ ${company}`;
      } else if (role) {
        scopeEl.textContent = `Analyzing for: ${role}`;
      } else {
        scopeEl.textContent = 'Role-aware ATS scoring & recommendations';
      }
    }
  }

  // ── Analysis request ───────────────────────────────────────────
  async function runAnalysis() {
    const resumeText   = textarea.value.trim();
    const targetRole   = roleInput.value.trim();
    const targetCompany = compInput.value.trim();
    const programme    = getProgrammeCode();

    errorEl.style.display = 'none';

    const token = await getToken();
    if (!token) { showError('Please sign in before using the Resume Analyzer.'); return; }

    showView('loading');

    try {
      const res = await fetch('/api/ai/resume-analyze', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, programme, targetRole, targetCompany })
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error?.message || 'Analysis failed.');

      renderResults(payload.analysis, { targetRole, targetCompany });
      showView('results');
    } catch (err) {
      showView('form');
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  function showError(msg) {
    errorEl.style.display = '';
    errorEl.innerHTML = `<div class="pg-ra-error-box">${esc(msg)}</div>`;
  }

  // ── Results rendering ──────────────────────────────────────────
  function renderResults(analysis, inputs) {
    const score  = analysis.overallScore;
    const scores = analysis.scores;
    const color  = score >= 75 ? '#059669' : score >= 55 ? '#d97706' : '#dc2626';

    const filled = (score / 100) * CIRCUMFERENCE;
    const gap    = CIRCUMFERENCE - filled;

    const targetLabel = [inputs.targetRole, inputs.targetCompany].filter(Boolean).join(' @ ')
      || (analysis.programme?.toUpperCase() + ' programme');

    const barDefs = [
      { name: 'ATS Structure', key: 'ats' },
      { name: 'Core Skills',   key: 'skills' },
      { name: 'Tools',         key: 'tools' },
      { name: 'Role Align',    key: 'roleAlignment' },
      { name: 'Impact',        key: 'impact' },
      { name: 'Projects',      key: 'projects' }
    ];

    const barsHtml = barDefs.map(({ name, key }) => {
      const v = scores[key] ?? 0;
      const cls = v >= 70 ? '' : v >= 45 ? ' amber' : ' red';
      return `
        <div class="pg-ra-bar-row">
          <span class="pg-ra-bar-name">${name}</span>
          <div class="pg-ra-bar-track">
            <div class="pg-ra-bar-fill${cls}" data-target="${v}" style="width:0%"></div>
          </div>
          <span class="pg-ra-bar-val">${v}</span>
        </div>`;
    }).join('');

    const foundTags = (analysis.extracted?.skills || []).slice(0, 10)
      .map(s => `<span class="pg-ra-tag found">${esc(s)}</span>`).join('');

    const missTags = [
      ...(analysis.missing?.prioritySkills || []),
      ...(analysis.missing?.tools || [])
    ].slice(0, 10).map(s => `<span class="pg-ra-tag miss">${esc(s)}</span>`).join('');

    const recsHtml = (analysis.recommendations || []).map(r =>
      `<div class="pg-ra-rec"><span class="pg-ra-rec-arrow">→</span>${esc(r)}</div>`
    ).join('');

    const explainHtml = (analysis.explanation || []).map(l => `<p>${esc(l)}</p>`).join('');

    resView.innerHTML = `
      <div class="pg-ra-hero">
        <div class="pg-ra-gauge">
          <svg width="112" height="112" viewBox="0 0 110 110" aria-hidden="true">
            <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(31,41,51,0.08)" stroke-width="10"/>
            <circle cx="55" cy="55" r="44" fill="none" stroke="${color}" stroke-width="10"
              stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}"
              stroke-linecap="round" transform="rotate(-90 55 55)"/>
            <text x="55" y="59" text-anchor="middle" font-size="22" font-weight="900"
              fill="${color}" font-family="inherit">${score}</text>
            <text x="55" y="73" text-anchor="middle" font-size="9" fill="#7b8794"
              font-family="inherit">/100</text>
          </svg>
        </div>
        <div class="pg-ra-score-block">
          <div class="pg-ra-score-num" style="color:${color}">${score}<span style="font-size:16px;font-weight:500;color:#7b8794">/100</span></div>
          <div class="pg-ra-score-sub">Overall ATS + Placement Score</div>
          <div class="pg-ra-verdict">
            Analyzed for <strong>${esc(targetLabel)}</strong>.<br>
            ${verdict(score)}
          </div>
        </div>
      </div>

      <div class="pg-ra-section">Score Breakdown</div>
      <div class="pg-ra-bars">${barsHtml}</div>

      ${foundTags ? `<div class="pg-ra-section">Detected Skills</div><div class="pg-ra-tags">${foundTags}</div>` : ''}
      ${missTags  ? `<div class="pg-ra-section">Missing / Not Detected</div><div class="pg-ra-tags">${missTags}</div>` : ''}
      ${recsHtml  ? `<div class="pg-ra-section">Recommendations</div><div class="pg-ra-recs">${recsHtml}</div>` : ''}
      ${explainHtml ? `<div class="pg-ra-section">How This Score Was Calculated</div><div class="pg-ra-explain">${explainHtml}</div>` : ''}

      <div class="pg-ra-result-foot">
        <button class="pg-ra-btn-secondary" id="pgRaReset">Analyze Another Resume</button>
      </div>
    `;

    resView.querySelector('#pgRaReset').addEventListener('click', resetForm);

    // Animate bars after DOM paint
    requestAnimationFrame(() => {
      resView.querySelectorAll('.pg-ra-bar-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    });
  }

  function resetForm() {
    textarea.value = '';
    fileInput.value = '';
    fileNameEl.textContent = 'PDF, DOCX, or TXT';
    uploadStatusEl.textContent = 'Upload a CV or paste text below.';
    charEl.textContent = '0';
    roleInput.value = '';
    compInput.value = '';
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

  function verdict(s) {
    if (s >= 80) return 'Strong resume — well-positioned for shortlisting.';
    if (s >= 65) return 'Good foundation — a few targeted improvements can boost your chances significantly.';
    if (s >= 50) return 'Needs improvement — follow the recommendations to strengthen your profile.';
    return 'Significant gaps detected — prioritize the missing skills and ATS structure first.';
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  updateScope();
})();
