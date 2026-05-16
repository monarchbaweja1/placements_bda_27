(function initPlacementShortlistEstimator() {
  // Programme-specific company suggestions shown in the form
  const SUGGESTIONS = {
    bda:  ['Deloitte', 'KPMG', 'EY', 'Fractal Analytics', 'Mu Sigma', 'Accenture', 'Kantar', 'JP Morgan', 'Amazon', 'Capgemini'],
    bifs: ['HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Deloitte', 'KPMG', 'EY'],
    hcm:  ['Abbott', 'Cipla', 'Apollo Hospitals', 'KPMG', 'Deloitte'],
    core: ['Hindustan Unilever', 'Asian Paints', 'Deloitte', 'KPMG', 'Accenture']
  };
  const DEFAULT_SUGGESTIONS = ['Deloitte', 'KPMG', 'EY', 'Accenture', 'JP Morgan', 'Amazon'];

  // ── Build DOM ────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'pg-sl-wrap';
  wrap.innerHTML = `
    <button class="pg-sl-trigger" type="button" aria-label="Open Shortlist Probability Estimator">%</button>
    <span class="pg-sl-tip" aria-hidden="true">Shortlist Estimator</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'pg-sl-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Shortlist Probability Estimator');
  overlay.innerHTML = `
    <div class="pg-sl-modal">
      <div class="pg-sl-head">
        <div class="pg-sl-head-icon">%</div>
        <div class="pg-sl-head-text">
          <strong>Shortlist Probability Estimator</strong>
          <span id="pgSlScope">AI-based estimate · Not a guarantee</span>
        </div>
        <button class="pg-sl-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="pg-sl-body" id="pgSlBody">
        <!-- Form -->
        <div id="pgSlFormView">
          <div class="pg-sl-upload-row">
            <div>
              <label class="pg-sl-field-label" for="pgSlFile">Upload CV</label>
              <input class="pg-sl-file" id="pgSlFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">
            </div>
            <div class="pg-sl-upload-meta">
              <strong id="pgSlFileName">PDF, DOCX, or TXT</strong>
              <span id="pgSlUploadStatus">Upload a CV to auto-fill skills and project signals.</span>
            </div>
          </div>

          <div class="pg-sl-grid-2">
            <div>
              <label class="pg-sl-field-label" for="pgSlCgpa">Your CGPA</label>
              <input class="pg-sl-input" id="pgSlCgpa" type="number" min="0" max="8" step="0.01"
                placeholder="e.g. 7.2 (out of 8)">
            </div>
            <div>
              <!-- programme is read from page context; shown for reference -->
              <label class="pg-sl-field-label">Programme</label>
              <input class="pg-sl-input" id="pgSlProgDisplay" type="text" placeholder="Detected from page" readonly
                style="background:rgba(31,41,51,0.04);cursor:default;">
            </div>
          </div>

          <div style="margin-bottom:14px">
            <label class="pg-sl-field-label" for="pgSlSkills">Your Skills &amp; Tools</label>
            <textarea class="pg-sl-textarea" id="pgSlSkills" maxlength="4000"
              placeholder="e.g. SQL, Python, Power BI, Machine Learning, Excel, Tableau, Statistics"></textarea>
          </div>

          <div style="margin-bottom:16px">
            <label class="pg-sl-field-label" for="pgSlProjects">Projects &amp; Experience (brief)</label>
            <textarea class="pg-sl-textarea" id="pgSlProjects" maxlength="4000"
              placeholder="e.g. Built customer churn model in Python, SQL dashboard for sales team, credit risk internship at HDFC"></textarea>
          </div>

          <div class="pg-sl-company-section">
            <label class="pg-sl-field-label">Target Companies <span style="font-weight:400;text-transform:none;font-size:10px">(add up to 8)</span></label>
            <div class="pg-sl-company-add">
              <input class="pg-sl-input" id="pgSlCompanyInput" type="text"
                placeholder="Type a company name and press +" maxlength="80">
              <button class="pg-sl-add-btn" id="pgSlAddBtn" type="button">+</button>
            </div>
            <div class="pg-sl-company-chips" id="pgSlChips"></div>
            <div class="pg-sl-suggestions" id="pgSlSuggestions"></div>
          </div>

          <div class="pg-sl-form-foot">
            <span class="pg-sl-form-note">AI estimates based on your CGPA, skills, and target companies.<br>Not a prediction or guarantee of actual shortlisting.</span>
            <button class="pg-sl-btn-primary" id="pgSlSubmit" type="button" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Estimate Probability
            </button>
          </div>
          <div id="pgSlError" style="display:none"></div>
        </div>

        <!-- Loading -->
        <div id="pgSlLoadingView" style="display:none">
          <div class="pg-sl-loading">
            <div class="pg-sl-spinner"></div>
            <p>Calculating shortlist probability estimates&hellip;</p>
          </div>
        </div>

        <!-- Results -->
        <div id="pgSlResultsView" style="display:none"></div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Refs ─────────────────────────────────────────────────────────
  const trigger      = wrap.querySelector('.pg-sl-trigger');
  const closeBtn     = overlay.querySelector('.pg-sl-close-btn');
  const fileInput    = overlay.querySelector('#pgSlFile');
  const fileNameEl   = overlay.querySelector('#pgSlFileName');
  const uploadStatusEl = overlay.querySelector('#pgSlUploadStatus');
  const cgpaInput    = overlay.querySelector('#pgSlCgpa');
  const progDisplay  = overlay.querySelector('#pgSlProgDisplay');
  const skillsInput  = overlay.querySelector('#pgSlSkills');
  const projInput    = overlay.querySelector('#pgSlProjects');
  const compInput    = overlay.querySelector('#pgSlCompanyInput');
  const addBtn       = overlay.querySelector('#pgSlAddBtn');
  const chipsEl      = overlay.querySelector('#pgSlChips');
  const suggestEl    = overlay.querySelector('#pgSlSuggestions');
  const submitBtn    = overlay.querySelector('#pgSlSubmit');
  const errorEl      = overlay.querySelector('#pgSlError');
  const scopeEl      = overlay.querySelector('#pgSlScope');
  const formView     = overlay.querySelector('#pgSlFormView');
  const loadView     = overlay.querySelector('#pgSlLoadingView');
  const resView      = overlay.querySelector('#pgSlResultsView');

  let companies = [];
  let extractedResumeText = '';

  // ── Interaction ──────────────────────────────────────────────────
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  document.addEventListener('placement:programme-change', updateScope);
  setInterval(updateScope, 800);

  cgpaInput.addEventListener('input', checkReady);
  fileInput.addEventListener('change', handleFileUpload);
  addBtn.addEventListener('click', addCompany);
  compInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCompany(); } });

  function open() {
    if (!isProgrammeViewActive()) return;
    overlay.classList.add('open');
    updateScope();
    setTimeout(() => cgpaInput.focus(), 60);
  }

  function close() { overlay.classList.remove('open'); }

  function showView(name) {
    formView.style.display = name === 'form'    ? '' : 'none';
    loadView.style.display = name === 'loading' ? '' : 'none';
    resView.style.display  = name === 'results' ? '' : 'none';
  }

  function updateScope() {
    const active = isProgrammeViewActive();
    wrap.hidden = !active;
    if (!active) {
      overlay.classList.remove('open');
      if (scopeEl) scopeEl.textContent = 'Select a programme to scope estimates';
      if (progDisplay) progDisplay.value = '';
      return;
    }

    const code = getProgrammeCode();
    if (scopeEl) scopeEl.textContent = 'AI-based probability estimate · Not a guarantee';
    if (progDisplay) progDisplay.value = code ? code.toUpperCase() : '';
    renderSuggestions();
    checkReady();
  }

  function checkReady() {
    const cgpa = parseFloat(cgpaInput.value);
    submitBtn.disabled = !(companies.length > 0 && !isNaN(cgpa) && cgpa >= 0 && cgpa <= 8);
  }

  async function handleFileUpload() {
    const file = fileInput.files?.[0];
    if (!file) return;

    errorEl.style.display = 'none';
    fileNameEl.textContent = file.name;
    uploadStatusEl.textContent = 'Extracting resume text...';
    fileInput.disabled = true;

    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in before uploading a resume.');
      const payload = await window.PlacementResumeUpload.extractResumeFile(file, token);
      extractedResumeText = payload.text;

      const derivedCgpa = window.PlacementResumeUpload.deriveCgpa(payload.text);
      const derivedSkills = window.PlacementResumeUpload.deriveSkills(payload.text);
      const derivedSummary = window.PlacementResumeUpload.deriveProfileSummary(payload.text);
      if (derivedCgpa) cgpaInput.value = derivedCgpa;
      if (derivedSkills) skillsInput.value = derivedSkills;
      if (derivedSummary) projInput.value = derivedSummary.slice(0, 4000);

      uploadStatusEl.textContent = `Extracted ${payload.characters.toLocaleString()} characters. Auto-filled fields are editable.`;
      checkReady();
    } catch (err) {
      extractedResumeText = '';
      uploadStatusEl.textContent = 'Upload failed.';
      showError(err.message || 'Could not extract this resume.');
    } finally {
      fileInput.disabled = false;
    }
  }

  // ── Company chip management ──────────────────────────────────────
  function addCompany() {
    const val = compInput.value.trim();
    if (!val || companies.includes(val) || companies.length >= 8) return;
    companies.push(val);
    compInput.value = '';
    renderChips();
    checkReady();
  }

  function removeCompany(name) {
    companies = companies.filter(c => c !== name);
    renderChips();
    checkReady();
  }

  function renderChips() {
    chipsEl.innerHTML = companies.map(c => `
      <span class="pg-sl-chip">
        ${esc(c)}
        <button class="pg-sl-chip-x" type="button" data-company="${esc(c)}" aria-label="Remove ${esc(c)}">&#215;</button>
      </span>
    `).join('');
    chipsEl.querySelectorAll('.pg-sl-chip-x').forEach(btn => {
      btn.addEventListener('click', () => removeCompany(btn.dataset.company));
    });
  }

  function renderSuggestions() {
    const code = getProgrammeCode();
    const list = (code && SUGGESTIONS[code]) ? SUGGESTIONS[code] : DEFAULT_SUGGESTIONS;
    suggestEl.innerHTML = list.map(c => `<button class="pg-sl-suggestion" type="button">${esc(c)}</button>`).join('');
    suggestEl.querySelectorAll('.pg-sl-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!companies.includes(btn.textContent) && companies.length < 8) {
          companies.push(btn.textContent);
          renderChips();
          checkReady();
        }
      });
    });
  }

  // ── Request ──────────────────────────────────────────────────────
  submitBtn.addEventListener('click', runEstimate);

  async function runEstimate() {
    const cgpa     = parseFloat(cgpaInput.value);
    const skills   = skillsInput.value.trim();
    const projects = projInput.value.trim();
    const programme = getProgrammeCode();

    errorEl.style.display = 'none';

    const token = await getToken();
    if (!token) { showError('Please sign in to use the Shortlist Estimator.'); return; }

    showView('loading');

    try {
      let res;
      try {
        res = await fetchWithLocalFallback('/api/ai/shortlist-probability', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ programme, cgpa, skills, projects, resumeText: extractedResumeText, targetCompanies: companies })
        });
      } catch {
        throw new Error('Could not reach the shortlist estimator API. Start the app with npm run dev and open http://localhost:3000, then try again.');
      }
      const payload = await readJson(res);
      if (!res.ok || !payload.ok) throw new Error(payload?.error?.message || 'Estimation failed.');

      renderResults(payload);
      showView('results');
    } catch (err) {
      showView('form');
      showError(err.message || 'Something went wrong. Please try again.');
    }
  }

  function showError(msg) {
    errorEl.style.display = '';
    errorEl.innerHTML = `<div class="pg-sl-error-box">${esc(msg)}</div>`;
  }

  // ── Results rendering ────────────────────────────────────────────
  function renderResults(payload) {
    const estimates = payload.estimates || [];

    const cardsHtml = estimates.map(est => {
      if (!est.known && !est.aiEstimated) return unknownCard(est);

      const p = est.probability;
      const tier = p >= 60 ? 'high' : p >= 35 ? 'medium' : 'low';
      const bd = est.breakdown || {};

      const barDefs = [
        { name: 'CGPA',         val: bd.cgpa     ?? 0 },
        { name: 'Skills',       val: bd.skills   ?? 0 },
        { name: 'Role Align',   val: bd.role     ?? 0 },
        { name: 'Projects',     val: bd.projects ?? 0 }
      ];
      const barsHtml = barDefs.map(({ name, val }) => {
        const cls = val >= 70 ? '' : val >= 45 ? ' amber' : ' red';
        return `
          <div class="pg-sl-bar-row">
            <span class="pg-sl-bar-name">${name}</span>
            <div class="pg-sl-bar-track">
              <div class="pg-sl-bar-fill${cls}" data-target="${val}" style="width:0%"></div>
            </div>
            <span class="pg-sl-bar-val">${val}</span>
          </div>`;
      }).join('');

      const reasonsHtml = (est.reasons || []).map(r =>
        `<div class="pg-sl-reason"><span class="pg-sl-reason-dot">●</span>${esc(r)}</div>`
      ).join('');

      const aiTag = est.aiEstimated
        ? `<span class="pg-sl-ai-tag" title="Profile generated by AI — may not reflect actual hiring criteria">AI Estimated</span>`
        : '';

      return `
        <div class="pg-sl-card${est.aiEstimated ? ' pg-sl-card-ai' : ''}">
          <div class="pg-sl-card-top">
            <div class="pg-sl-prob-badge ${tier}">
              <div class="pg-sl-prob-num">${p}</div>
              <div class="pg-sl-prob-pct">%</div>
            </div>
            <div class="pg-sl-card-info">
              <div class="pg-sl-card-name">${esc(est.company)}${aiTag}</div>
              <div class="pg-sl-card-sector">${esc(est.sector || '')}</div>
            </div>
          </div>
          <div class="pg-sl-bars">${barsHtml}</div>
          ${reasonsHtml ? `<div class="pg-sl-reasons">${reasonsHtml}</div>` : ''}
          ${est.caveat ? `<div class="pg-sl-card-caveat">${esc(est.caveat)}</div>` : ''}
        </div>`;
    }).join('');

    resView.innerHTML = `
      <div class="pg-sl-section">Shortlist Probability Estimates</div>
      <div class="pg-sl-cards">${cardsHtml}</div>
      <div class="pg-sl-disclaimer">
        ⚠ These are AI-based estimates derived from your profile and each company's known hiring standards.
        They are <strong>not predictions or guarantees</strong> of actual shortlisting.
        Use them for self-assessment and targeted preparation only.
      </div>
      <div class="pg-sl-result-foot">
        <button class="pg-sl-btn-secondary" id="pgSlReset">New Estimate</button>
      </div>
    `;

    resView.querySelector('#pgSlReset').addEventListener('click', resetForm);

    // Animate bars
    requestAnimationFrame(() => {
      resView.querySelectorAll('.pg-sl-bar-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    });
  }

  function unknownCard(est) {
    return `
      <div class="pg-sl-card pg-sl-card-unknown">
        <div class="pg-sl-card-name">${esc(est.company)}</div>
        <div class="pg-sl-unknown-label">${esc(est.caveat || 'No historical data available for this company in your programme.')}</div>
      </div>`;
  }

  function resetForm() {
    companies = [];
    extractedResumeText = '';
    fileInput.value = '';
    fileNameEl.textContent = 'PDF, DOCX, or TXT';
    uploadStatusEl.textContent = 'Upload a CV to auto-fill skills and project signals.';
    renderChips();
    cgpaInput.value = '';
    skillsInput.value = '';
    projInput.value = '';
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    showView('form');
  }

  // ── Helpers ──────────────────────────────────────────────────────
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

  async function readJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(res.ok
        ? 'Estimator returned an invalid response.'
        : `Estimator request failed (${res.status}). Please refresh and try again.`);
    }
  }

  function apiUrl(path) {
    if (window.PLACEMENT_API_BASE) return `${String(window.PLACEMENT_API_BASE).replace(/\/$/, '')}${path}`;
    if (window.location.protocol === 'file:') return `http://localhost:3000${path}`;
    return path;
  }

  async function fetchWithLocalFallback(path, options) {
    if (window.location.protocol !== 'file:') return fetch(apiUrl(path), options);

    const urls = [
      apiUrl(path),
      `http://localhost:3001${path}`
    ];
    let lastError;
    for (const url of urls) {
      try {
        return await fetch(url, options);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Local API unavailable.');
  }

  updateScope();
  renderSuggestions();
})();
