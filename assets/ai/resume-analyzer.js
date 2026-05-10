(function initGimResumeAnalyzer() {
  const CIRCUMFERENCE = 2 * Math.PI * 44;

  // ── Build DOM ──────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'gim-ra-wrap';
  wrap.innerHTML = `
    <button class="gim-ra-trigger" type="button" aria-label="Open Resume Analyzer">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 2v6h6M9 13h6M9 17h4"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <span class="gim-ra-tip" aria-hidden="true">Resume Analyzer</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'gim-ra-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'GIM Resume Analyzer');
  overlay.innerHTML = `
    <div class="gim-ra-modal">
      <div class="gim-ra-head">
        <div class="gim-ra-head-icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 2v6h6M9 13h6M9 17h4"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="gim-ra-head-text">
          <strong>Resume Analyzer</strong>
          <span id="gimRaScope">Programme-aware ATS scoring &amp; recommendations</span>
        </div>
        <button class="gim-ra-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="gim-ra-body" id="gimRaBody">
        <!-- Form view -->
        <div id="gimRaFormView">
          <label class="gim-ra-field-label" for="gimRaText">Paste your resume text</label>
          <textarea class="gim-ra-textarea" id="gimRaText" maxlength="80000"
            placeholder="Copy all text from your PDF resume and paste it here. The more complete the text, the more accurate the analysis."></textarea>
          <div class="gim-ra-charcount"><span id="gimRaChars">0</span>&nbsp;/ 80,000 characters</div>

          <div class="gim-ra-grid">
            <div>
              <label class="gim-ra-field-label" for="gimRaRole">Target Role <span style="font-weight:400;text-transform:none;font-size:10px">(optional)</span></label>
              <input class="gim-ra-input" id="gimRaRole" type="text" placeholder="e.g. Data Analyst" maxlength="120">
            </div>
            <div>
              <label class="gim-ra-field-label" for="gimRaCompany">Target Company <span style="font-weight:400;text-transform:none;font-size:10px">(optional)</span></label>
              <input class="gim-ra-input" id="gimRaCompany" type="text" placeholder="e.g. Deloitte" maxlength="120">
            </div>
          </div>

          <div class="gim-ra-form-foot">
            <span class="gim-ra-form-note">Minimum 500 characters required for analysis</span>
            <button class="gim-ra-btn-primary" id="gimRaSubmit" type="button" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Analyze Resume
            </button>
          </div>
          <div id="gimRaError" style="display:none"></div>
        </div>

        <!-- Loading view -->
        <div id="gimRaLoadingView" style="display:none">
          <div class="gim-ra-loading">
            <div class="gim-ra-spinner"></div>
            <p>Analyzing your resume against programme requirements&hellip;<br>This takes a few seconds.</p>
          </div>
        </div>

        <!-- Results view -->
        <div id="gimRaResultsView" style="display:none"></div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Element refs ───────────────────────────────────────────────
  const trigger   = wrap.querySelector('.gim-ra-trigger');
  const closeBtn  = overlay.querySelector('.gim-ra-close-btn');
  const textarea  = overlay.querySelector('#gimRaText');
  const charEl    = overlay.querySelector('#gimRaChars');
  const roleInput = overlay.querySelector('#gimRaRole');
  const compInput = overlay.querySelector('#gimRaCompany');
  const submitBtn = overlay.querySelector('#gimRaSubmit');
  const errorEl   = overlay.querySelector('#gimRaError');
  const scopeEl   = overlay.querySelector('#gimRaScope');
  const formView  = overlay.querySelector('#gimRaFormView');
  const loadView  = overlay.querySelector('#gimRaLoadingView');
  const resView   = overlay.querySelector('#gimRaResultsView');

  // ── Interaction ────────────────────────────────────────────────
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  document.addEventListener('gim:programme-change', updateScope);

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charEl.textContent = len.toLocaleString();
    submitBtn.disabled = len < 500;
  });

  submitBtn.addEventListener('click', runAnalysis);

  function open() {
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

  function updateScope() {
    const code = getProgrammeCode();
    if (scopeEl) scopeEl.textContent = code
      ? `${code.toUpperCase()} · ATS scoring & recommendations`
      : 'Select a programme before analyzing';
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
    errorEl.innerHTML = `<div class="gim-ra-error-box">${esc(msg)}</div>`;
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
        <div class="gim-ra-bar-row">
          <span class="gim-ra-bar-name">${name}</span>
          <div class="gim-ra-bar-track">
            <div class="gim-ra-bar-fill${cls}" data-target="${v}" style="width:0%"></div>
          </div>
          <span class="gim-ra-bar-val">${v}</span>
        </div>`;
    }).join('');

    const foundTags = (analysis.extracted?.skills || []).slice(0, 10)
      .map(s => `<span class="gim-ra-tag found">${esc(s)}</span>`).join('');

    const missTags = [
      ...(analysis.missing?.prioritySkills || []),
      ...(analysis.missing?.tools || [])
    ].slice(0, 10).map(s => `<span class="gim-ra-tag miss">${esc(s)}</span>`).join('');

    const recsHtml = (analysis.recommendations || []).map(r =>
      `<div class="gim-ra-rec"><span class="gim-ra-rec-arrow">→</span>${esc(r)}</div>`
    ).join('');

    const explainHtml = (analysis.explanation || []).map(l => `<p>${esc(l)}</p>`).join('');

    resView.innerHTML = `
      <div class="gim-ra-hero">
        <div class="gim-ra-gauge">
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
        <div class="gim-ra-score-block">
          <div class="gim-ra-score-num" style="color:${color}">${score}<span style="font-size:16px;font-weight:500;color:#7b8794">/100</span></div>
          <div class="gim-ra-score-sub">Overall ATS + Placement Score</div>
          <div class="gim-ra-verdict">
            Analyzed for <strong>${esc(targetLabel)}</strong>.<br>
            ${verdict(score)}
          </div>
        </div>
      </div>

      <div class="gim-ra-section">Score Breakdown</div>
      <div class="gim-ra-bars">${barsHtml}</div>

      ${foundTags ? `<div class="gim-ra-section">Detected Skills</div><div class="gim-ra-tags">${foundTags}</div>` : ''}
      ${missTags  ? `<div class="gim-ra-section">Missing / Not Detected</div><div class="gim-ra-tags">${missTags}</div>` : ''}
      ${recsHtml  ? `<div class="gim-ra-section">Recommendations</div><div class="gim-ra-recs">${recsHtml}</div>` : ''}
      ${explainHtml ? `<div class="gim-ra-section">How This Score Was Calculated</div><div class="gim-ra-explain">${explainHtml}</div>` : ''}

      <div class="gim-ra-result-foot">
        <button class="gim-ra-btn-secondary" id="gimRaReset">Analyze Another Resume</button>
      </div>
    `;

    resView.querySelector('#gimRaReset').addEventListener('click', resetForm);

    // Animate bars after DOM paint
    requestAnimationFrame(() => {
      resView.querySelectorAll('.gim-ra-bar-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    });
  }

  function resetForm() {
    textarea.value = '';
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
