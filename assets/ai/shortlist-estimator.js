(function initGimShortlistEstimator() {
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
  wrap.className = 'gim-sl-wrap';
  wrap.innerHTML = `
    <button class="gim-sl-trigger" type="button" aria-label="Open Shortlist Probability Estimator">%</button>
    <span class="gim-sl-tip" aria-hidden="true">Shortlist Estimator</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'gim-sl-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'GIM Shortlist Probability Estimator');
  overlay.innerHTML = `
    <div class="gim-sl-modal">
      <div class="gim-sl-head">
        <div class="gim-sl-head-icon">%</div>
        <div class="gim-sl-head-text">
          <strong>Shortlist Probability Estimator</strong>
          <span id="gimSlScope">AI-based estimate · Not a guarantee</span>
        </div>
        <button class="gim-sl-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="gim-sl-body" id="gimSlBody">
        <!-- Form -->
        <div id="gimSlFormView">
          <div class="gim-sl-grid-2">
            <div>
              <label class="gim-sl-field-label" for="gimSlCgpa">Your CGPA</label>
              <input class="gim-sl-input" id="gimSlCgpa" type="number" min="0" max="10" step="0.01"
                placeholder="e.g. 7.4">
            </div>
            <div>
              <!-- programme is read from page context; shown for reference -->
              <label class="gim-sl-field-label">Programme</label>
              <input class="gim-sl-input" id="gimSlProgDisplay" type="text" placeholder="Detected from page" readonly
                style="background:rgba(31,41,51,0.04);cursor:default;">
            </div>
          </div>

          <div style="margin-bottom:14px">
            <label class="gim-sl-field-label" for="gimSlSkills">Your Skills &amp; Tools</label>
            <textarea class="gim-sl-textarea" id="gimSlSkills" maxlength="4000"
              placeholder="e.g. SQL, Python, Power BI, Machine Learning, Excel, Tableau, Statistics"></textarea>
          </div>

          <div style="margin-bottom:16px">
            <label class="gim-sl-field-label" for="gimSlProjects">Projects &amp; Experience (brief)</label>
            <textarea class="gim-sl-textarea" id="gimSlProjects" maxlength="4000"
              placeholder="e.g. Built customer churn model in Python, SQL dashboard for sales team, credit risk internship at HDFC"></textarea>
          </div>

          <div class="gim-sl-company-section">
            <label class="gim-sl-field-label">Target Companies <span style="font-weight:400;text-transform:none;font-size:10px">(add up to 8)</span></label>
            <div class="gim-sl-company-add">
              <input class="gim-sl-input" id="gimSlCompanyInput" type="text"
                placeholder="Type a company name and press +" maxlength="80">
              <button class="gim-sl-add-btn" id="gimSlAddBtn" type="button">+</button>
            </div>
            <div class="gim-sl-company-chips" id="gimSlChips"></div>
            <div class="gim-sl-suggestions" id="gimSlSuggestions"></div>
          </div>

          <div class="gim-sl-form-foot">
            <span class="gim-sl-form-note">Probabilities are AI estimates only. Results depend on data<br>available in the system for your programme.</span>
            <button class="gim-sl-btn-primary" id="gimSlSubmit" type="button" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Estimate Probability
            </button>
          </div>
          <div id="gimSlError" style="display:none"></div>
        </div>

        <!-- Loading -->
        <div id="gimSlLoadingView" style="display:none">
          <div class="gim-sl-loading">
            <div class="gim-sl-spinner"></div>
            <p>Calculating shortlist probability estimates&hellip;</p>
          </div>
        </div>

        <!-- Results -->
        <div id="gimSlResultsView" style="display:none"></div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Refs ─────────────────────────────────────────────────────────
  const trigger      = wrap.querySelector('.gim-sl-trigger');
  const closeBtn     = overlay.querySelector('.gim-sl-close-btn');
  const cgpaInput    = overlay.querySelector('#gimSlCgpa');
  const progDisplay  = overlay.querySelector('#gimSlProgDisplay');
  const skillsInput  = overlay.querySelector('#gimSlSkills');
  const projInput    = overlay.querySelector('#gimSlProjects');
  const compInput    = overlay.querySelector('#gimSlCompanyInput');
  const addBtn       = overlay.querySelector('#gimSlAddBtn');
  const chipsEl      = overlay.querySelector('#gimSlChips');
  const suggestEl    = overlay.querySelector('#gimSlSuggestions');
  const submitBtn    = overlay.querySelector('#gimSlSubmit');
  const errorEl      = overlay.querySelector('#gimSlError');
  const scopeEl      = overlay.querySelector('#gimSlScope');
  const formView     = overlay.querySelector('#gimSlFormView');
  const loadView     = overlay.querySelector('#gimSlLoadingView');
  const resView      = overlay.querySelector('#gimSlResultsView');

  let companies = [];

  // ── Interaction ──────────────────────────────────────────────────
  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
  document.addEventListener('gim:programme-change', updateScope);

  cgpaInput.addEventListener('input', checkReady);
  addBtn.addEventListener('click', addCompany);
  compInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCompany(); } });

  function open() {
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
    const code = getProgrammeCode();
    if (scopeEl) scopeEl.textContent = code
      ? `${code.toUpperCase()} · AI-based estimate · Not a guarantee`
      : 'Select a programme to scope estimates';
    if (progDisplay) progDisplay.value = code ? code.toUpperCase() : '';
    renderSuggestions();
    checkReady();
  }

  function checkReady() {
    const cgpa = parseFloat(cgpaInput.value);
    submitBtn.disabled = !(companies.length > 0 && !isNaN(cgpa) && cgpa >= 0 && cgpa <= 10);
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
      <span class="gim-sl-chip">
        ${esc(c)}
        <button class="gim-sl-chip-x" type="button" data-company="${esc(c)}" aria-label="Remove ${esc(c)}">&#215;</button>
      </span>
    `).join('');
    chipsEl.querySelectorAll('.gim-sl-chip-x').forEach(btn => {
      btn.addEventListener('click', () => removeCompany(btn.dataset.company));
    });
  }

  function renderSuggestions() {
    const code = getProgrammeCode();
    const list = (code && SUGGESTIONS[code]) ? SUGGESTIONS[code] : DEFAULT_SUGGESTIONS;
    suggestEl.innerHTML = list.map(c => `<button class="gim-sl-suggestion" type="button">${esc(c)}</button>`).join('');
    suggestEl.querySelectorAll('.gim-sl-suggestion').forEach(btn => {
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
      const res = await fetch('/api/ai/shortlist-probability', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ programme, cgpa, skills, projects, targetCompanies: companies })
      });
      const payload = await res.json();
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
    errorEl.innerHTML = `<div class="gim-sl-error-box">${esc(msg)}</div>`;
  }

  // ── Results rendering ────────────────────────────────────────────
  function renderResults(payload) {
    const estimates = payload.estimates || [];

    const cardsHtml = estimates.map(est => {
      if (!est.known) return unknownCard(est);

      const p = est.probability;
      const tier = p >= 60 ? 'high' : p >= 35 ? 'medium' : 'low';
      const bd = est.breakdown || {};

      const barDefs = [
        { name: 'CGPA',         val: bd.cgpa          ?? 0 },
        { name: 'Skills',       val: bd.skills        ?? 0 },
        { name: 'Role Align',   val: bd.roleAlignment ?? 0 },
        { name: 'Projects',     val: bd.projects      ?? 0 }
      ];
      const barsHtml = barDefs.map(({ name, val }) => {
        const cls = val >= 70 ? '' : val >= 45 ? ' amber' : ' red';
        return `
          <div class="gim-sl-bar-row">
            <span class="gim-sl-bar-name">${name}</span>
            <div class="gim-sl-bar-track">
              <div class="gim-sl-bar-fill${cls}" data-target="${val}" style="width:0%"></div>
            </div>
            <span class="gim-sl-bar-val">${val}</span>
          </div>`;
      }).join('');

      const reasonsHtml = (est.reasons || []).map(r =>
        `<div class="gim-sl-reason"><span class="gim-sl-reason-dot">●</span>${esc(r)}</div>`
      ).join('');

      return `
        <div class="gim-sl-card">
          <div class="gim-sl-card-top">
            <div class="gim-sl-prob-badge ${tier}">
              <div class="gim-sl-prob-num">${p}</div>
              <div class="gim-sl-prob-pct">%</div>
            </div>
            <div class="gim-sl-card-info">
              <div class="gim-sl-card-name">${esc(est.company)}</div>
              <div class="gim-sl-card-sector">${esc(est.sector || '')}</div>
            </div>
          </div>
          <div class="gim-sl-bars">${barsHtml}</div>
          ${reasonsHtml ? `<div class="gim-sl-reasons">${reasonsHtml}</div>` : ''}
          ${est.caveat ? `<div class="gim-sl-card-caveat">${esc(est.caveat)}</div>` : ''}
        </div>`;
    }).join('');

    resView.innerHTML = `
      <div class="gim-sl-section">Shortlist Probability Estimates</div>
      <div class="gim-sl-cards">${cardsHtml}</div>
      <div class="gim-sl-disclaimer">
        ⚠ These are AI-based estimates derived from programme-level historical patterns.
        They are <strong>not predictions or guarantees</strong> of actual shortlisting.
        Use them for self-assessment and targeted preparation only.
      </div>
      <div class="gim-sl-result-foot">
        <button class="gim-sl-btn-secondary" id="gimSlReset">New Estimate</button>
      </div>
    `;

    resView.querySelector('#gimSlReset').addEventListener('click', resetForm);

    // Animate bars
    requestAnimationFrame(() => {
      resView.querySelectorAll('.gim-sl-bar-fill').forEach(el => {
        el.style.width = el.dataset.target + '%';
      });
    });
  }

  function unknownCard(est) {
    return `
      <div class="gim-sl-card gim-sl-card-unknown">
        <div class="gim-sl-card-name">${esc(est.company)}</div>
        <div class="gim-sl-unknown-label">${esc(est.caveat || 'No historical data available for this company in your programme.')}</div>
      </div>`;
  }

  function resetForm() {
    companies = [];
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
  renderSuggestions();
})();
