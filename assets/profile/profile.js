(function initProfile() {
  'use strict';

  let state = {
    profile: null,
    placement: null,
    placementStatus: 'searching',
    loading: false
  };

  // ── Auth helpers ───────────────────────────────────────────
  function getToken() {
    try {
      const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) { const d = JSON.parse(localStorage.getItem(sbKey) || '{}'); return d?.access_token || null; }
    } catch {}
    return null;
  }

  // ── API helpers ────────────────────────────────────────────
  async function apiGet(path) {
    const token = getToken();
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    let p; try { p = await res.json(); } catch { throw new Error('Server error.'); }
    if (!res.ok || !p?.ok) throw new Error(p?.error?.message || 'Request failed.');
    return p;
  }

  async function apiPost(path, body) {
    const token = getToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    let p; try { p = await res.json(); } catch { throw new Error('Server error.'); }
    if (!res.ok || !p?.ok) throw new Error(p?.error?.message || 'Request failed.');
    return p;
  }

  // ── Build DOM ──────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'pg-prf-wrap';
  wrap.innerHTML = `
    <button class="pg-prf-trigger" type="button" aria-label="My Profile">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.7"/>
        <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
          stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <span class="pg-prf-tip" aria-hidden="true">My Profile</span>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'pg-prf-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'My Profile & Placement Tracker');
  overlay.innerHTML = `
    <div class="pg-prf-modal">
      <div class="pg-prf-head">
        <div class="pg-prf-head-icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
            <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="pg-prf-head-text">
          <strong>My Profile</strong>
          <span id="pgPrfSubtitle">Track your placement journey and connect with batchmates</span>
        </div>
        <button class="pg-prf-close-btn" type="button" aria-label="Close">&#215;</button>
      </div>

      <div class="pg-prf-tabs">
        <button class="pg-prf-tab active" data-tab="profile">My Profile</button>
        <button class="pg-prf-tab" data-tab="placement">Placement Journey</button>
        <button class="pg-prf-tab" data-tab="board">Class Board</button>
      </div>

      <div class="pg-prf-body" id="pgPrfBody">

        <!-- ── Profile Tab ── -->
        <div id="pgPrfProfileTab">
          <div class="pg-prf-form-grid" style="margin-bottom:16px">
            <div class="pg-prf-form-group">
              <label class="pg-prf-label" for="pgPrfName">Full Name</label>
              <input class="pg-prf-input" id="pgPrfName" type="text" maxlength="100" placeholder="Your full name">
            </div>
            <div class="pg-prf-form-group">
              <label class="pg-prf-label" for="pgPrfRollNo">Roll Number</label>
              <input class="pg-prf-input" id="pgPrfRollNo" type="text" maxlength="30" placeholder="e.g. BDA-27-001">
            </div>
            <div class="pg-prf-form-group">
              <label class="pg-prf-label" for="pgPrfEmail">Email</label>
              <input class="pg-prf-input" id="pgPrfEmail" type="email" maxlength="200" placeholder="institute email">
            </div>
            <div class="pg-prf-form-group">
              <label class="pg-prf-label" for="pgPrfInternship">Summer Internship</label>
              <input class="pg-prf-input" id="pgPrfInternship" type="text" maxlength="200" placeholder="Company & role (if done)">
            </div>
            <div class="pg-prf-form-group span2">
              <label class="pg-prf-label" for="pgPrfResume">Resume / Portfolio Link</label>
              <input class="pg-prf-input" id="pgPrfResume" type="url" maxlength="500" placeholder="Drive / Notion / Portfolio URL">
            </div>
          </div>

          <div class="pg-prf-form-group" style="margin-bottom:16px">
            <label class="pg-prf-label">Target Roles <span style="font-weight:400;text-transform:none;letter-spacing:0">(press Enter or comma to add)</span></label>
            <div class="pg-prf-chip-wrap" id="pgPrfRolesWrap">
              <input class="pg-prf-chip-input" id="pgPrfRolesInput" type="text" placeholder="e.g. Data Analyst" maxlength="80">
            </div>
            <div class="pg-prf-chip-hint">Up to 10 roles</div>
          </div>

          <div class="pg-prf-form-group" style="margin-bottom:20px">
            <label class="pg-prf-label">Target Companies <span style="font-weight:400;text-transform:none;letter-spacing:0">(press Enter or comma to add)</span></label>
            <div class="pg-prf-chip-wrap" id="pgPrfCompaniesWrap">
              <input class="pg-prf-chip-input" id="pgPrfCompaniesInput" type="text" placeholder="e.g. Deloitte" maxlength="80">
            </div>
            <div class="pg-prf-chip-hint">Up to 15 companies</div>
          </div>

          <button class="pg-prf-save-btn" id="pgPrfSaveProfileBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:16px;height:16px">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save Profile
          </button>
          <div class="pg-prf-status" id="pgPrfProfileStatus"></div>
        </div>

        <!-- ── Placement Journey Tab ── -->
        <div id="pgPrfPlacementTab" style="display:none">
          <div style="font-size:12px;font-weight:700;color:#52616f;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">
            Current Status
          </div>
          <div class="pg-prf-status-row" id="pgPrfStatusRow">
            <div class="pg-prf-status-card" data-status="searching">
              <div class="pg-prf-status-icon">🔍</div>
              <div class="pg-prf-status-name">Searching</div>
              <div class="pg-prf-status-desc">Actively looking</div>
            </div>
            <div class="pg-prf-status-card interviewing" data-status="interviewing">
              <div class="pg-prf-status-icon">💬</div>
              <div class="pg-prf-status-name">Interviewing</div>
              <div class="pg-prf-status-desc">In process</div>
            </div>
            <div class="pg-prf-status-card placed" data-status="placed">
              <div class="pg-prf-status-icon">🎉</div>
              <div class="pg-prf-status-name">Placed</div>
              <div class="pg-prf-status-desc">Offer accepted</div>
            </div>
            <div class="pg-prf-status-card declined" data-status="declined">
              <div class="pg-prf-status-icon">🤝</div>
              <div class="pg-prf-status-name">Declined</div>
              <div class="pg-prf-status-desc">Offer declined</div>
            </div>
          </div>

          <div id="pgPrfOfferBox" style="display:none">
            <div class="pg-prf-offer-box">
              <div class="pg-prf-offer-title">🎯 Offer Details</div>
              <div class="pg-prf-form-grid">
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfOfferCompany">Company</label>
                  <input class="pg-prf-input" id="pgPrfOfferCompany" type="text" maxlength="200" placeholder="Company name">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfOfferRole">Role</label>
                  <input class="pg-prf-input" id="pgPrfOfferRole" type="text" maxlength="200" placeholder="Job title">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfCtc">CTC (LPA)</label>
                  <input class="pg-prf-input" id="pgPrfCtc" type="number" min="0" max="200" step="0.1" placeholder="e.g. 18.5">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfJoining">Joining Date</label>
                  <input class="pg-prf-input" id="pgPrfJoining" type="date">
                </div>
              </div>
            </div>
          </div>

          <button class="pg-prf-save-btn" id="pgPrfSavePlacementBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="width:16px;height:16px">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save Status
          </button>
          <div class="pg-prf-status" id="pgPrfPlacementStatus"></div>

          <!-- Interview Log -->
          <div class="pg-prf-interview-section">
            <div class="pg-prf-interview-header">
              <div class="pg-prf-interview-title">Interview Log <span id="pgPrfInterviewCount" style="font-weight:400;color:#7b8794"></span></div>
              <button class="pg-prf-add-interview-btn" id="pgPrfAddInterviewBtn">
                + Add Entry
              </button>
            </div>

            <div class="pg-prf-add-form" id="pgPrfAddForm">
              <div class="pg-prf-add-form-grid">
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfIntCompany">Company *</label>
                  <input class="pg-prf-input" id="pgPrfIntCompany" type="text" maxlength="100" placeholder="Company name">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfIntRole">Role</label>
                  <input class="pg-prf-input" id="pgPrfIntRole" type="text" maxlength="100" placeholder="Job title">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfIntRound">Round</label>
                  <input class="pg-prf-input" id="pgPrfIntRound" type="text" maxlength="100" placeholder="e.g. Case Interview, HR">
                </div>
                <div class="pg-prf-form-group">
                  <label class="pg-prf-label" for="pgPrfIntDate">Date</label>
                  <input class="pg-prf-input" id="pgPrfIntDate" type="date">
                </div>
              </div>
              <div class="pg-prf-form-group" style="margin-bottom:10px">
                <label class="pg-prf-label" for="pgPrfIntResult">Result</label>
                <select class="pg-prf-select" id="pgPrfIntResult">
                  <option value="pending">Pending / Waiting</option>
                  <option value="selected">Selected / Cleared</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div class="pg-prf-add-row">
                <button class="pg-prf-add-cancel" id="pgPrfAddCancel">Cancel</button>
                <button class="pg-prf-add-submit" id="pgPrfAddSubmit">Add Entry</button>
              </div>
            </div>

            <div class="pg-prf-interview-list" id="pgPrfInterviewList">
              <div style="text-align:center;padding:24px;color:#9aa5b1;font-size:13px">
                No interview entries yet. Add your first entry above.
              </div>
            </div>
          </div>
        </div>

        <!-- ── Class Board Tab ── -->
        <div id="pgPrfBoardTab" style="display:none">
          <div id="pgPrfBoardContent">
            <div style="padding:32px;text-align:center;color:#9aa5b1">
              <div class="pg-prf-spinner" style="margin:0 auto 12px"></div>
              Loading placement board…
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.body.appendChild(overlay);

  // ── Element refs ───────────────────────────────────────────
  const trigger      = wrap.querySelector('.pg-prf-trigger');
  const closeBtn     = overlay.querySelector('.pg-prf-close-btn');
  const tabs         = overlay.querySelectorAll('.pg-prf-tab');
  const profileTab   = document.getElementById('pgPrfProfileTab');
  const placementTab = document.getElementById('pgPrfPlacementTab');
  const boardTab     = document.getElementById('pgPrfBoardTab');

  const nameIn       = document.getElementById('pgPrfName');
  const rollIn       = document.getElementById('pgPrfRollNo');
  const emailIn      = document.getElementById('pgPrfEmail');
  const internIn     = document.getElementById('pgPrfInternship');
  const resumeIn     = document.getElementById('pgPrfResume');
  const rolesWrap    = document.getElementById('pgPrfRolesWrap');
  const rolesInput   = document.getElementById('pgPrfRolesInput');
  const compWrap     = document.getElementById('pgPrfCompaniesWrap');
  const compInput    = document.getElementById('pgPrfCompaniesInput');
  const saveProfileBtn    = document.getElementById('pgPrfSaveProfileBtn');
  const profileStatus     = document.getElementById('pgPrfProfileStatus');

  const statusCards       = overlay.querySelectorAll('.pg-prf-status-card');
  const offerBox          = document.getElementById('pgPrfOfferBox');
  const offerCompanyIn    = document.getElementById('pgPrfOfferCompany');
  const offerRoleIn       = document.getElementById('pgPrfOfferRole');
  const ctcIn             = document.getElementById('pgPrfCtc');
  const joiningIn         = document.getElementById('pgPrfJoining');
  const savePlacementBtn  = document.getElementById('pgPrfSavePlacementBtn');
  const placementStatus   = document.getElementById('pgPrfPlacementStatus');
  const interviewList     = document.getElementById('pgPrfInterviewList');
  const interviewCount    = document.getElementById('pgPrfInterviewCount');
  const addInterviewBtn   = document.getElementById('pgPrfAddInterviewBtn');
  const addForm           = document.getElementById('pgPrfAddForm');
  const addCancel         = document.getElementById('pgPrfAddCancel');
  const addSubmit         = document.getElementById('pgPrfAddSubmit');
  const boardContent      = document.getElementById('pgPrfBoardContent');

  // ── Chip inputs ────────────────────────────────────────────
  function makeChipInput(wrap, input, maxChips, getChips, setChips) {
    function addChip(val) {
      const v = val.trim().replace(/,+$/, '').trim();
      if (!v || getChips().includes(v) || getChips().length >= maxChips) return;
      setChips([...getChips(), v]);
      renderChips();
    }
    function renderChips() {
      wrap.querySelectorAll('.pg-prf-chip').forEach(c => c.remove());
      getChips().forEach(chip => {
        const el = document.createElement('span');
        el.className = 'pg-prf-chip';
        el.innerHTML = `${escHtml(chip)}<button class="pg-prf-chip-remove" type="button" data-val="${escHtml(chip)}" aria-label="Remove">&times;</button>`;
        wrap.insertBefore(el, input);
      });
    }
    wrap.addEventListener('click', () => input.focus());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault(); addChip(input.value); input.value = '';
      } else if (e.key === 'Backspace' && !input.value) {
        const chips = getChips(); if (chips.length) setChips(chips.slice(0, -1)); renderChips();
      }
    });
    input.addEventListener('blur', () => { if (input.value) { addChip(input.value); input.value = ''; } });
    wrap.addEventListener('click', e => {
      if (e.target.classList.contains('pg-prf-chip-remove')) {
        const val = e.target.dataset.val;
        setChips(getChips().filter(c => c !== val)); renderChips();
      }
    });
    return { render: renderChips };
  }

  let targetRoles = [], targetCompanies = [];
  const rolesCtrl = makeChipInput(rolesWrap, rolesInput, 10, () => targetRoles, v => { targetRoles = v; });
  const compCtrl  = makeChipInput(compWrap, compInput, 15, () => targetCompanies, v => { targetCompanies = v; });

  // ── Status picker ──────────────────────────────────────────
  statusCards.forEach(card => {
    card.addEventListener('click', () => {
      statusCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.placementStatus = card.dataset.status;
      const showOffer = ['placed', 'declined'].includes(state.placementStatus);
      offerBox.style.display = showOffer ? '' : 'none';
    });
  });

  // ── Helpers ────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function showStatus(el, type, msg) {
    el.className = `pg-prf-status ${type} visible`;
    el.innerHTML = type === 'loading' ? `<div class="pg-prf-spinner"></div>${msg}` : msg;
  }
  function clearStatus(el) { el.className = 'pg-prf-status'; el.textContent = ''; }

  // ── Populate form from loaded data ─────────────────────────
  function populateProfile(profile) {
    if (!profile) return;
    nameIn.value    = profile.name       || '';
    rollIn.value    = profile.roll_no    || '';
    emailIn.value   = profile.email      || '';
    internIn.value  = profile.internship || '';
    resumeIn.value  = profile.resume_link || '';
    targetRoles     = Array.isArray(profile.target_roles)     ? profile.target_roles     : [];
    targetCompanies = Array.isArray(profile.target_companies) ? profile.target_companies : [];
    rolesCtrl.render();
    compCtrl.render();
  }

  function populatePlacement(placement) {
    if (!placement) return;
    const status = placement.status || 'searching';
    state.placementStatus = status;
    statusCards.forEach(c => {
      c.classList.toggle('active', c.dataset.status === status);
    });
    const showOffer = ['placed', 'declined'].includes(status);
    offerBox.style.display = showOffer ? '' : 'none';
    offerCompanyIn.value = placement.offer_company || '';
    offerRoleIn.value    = placement.offer_role    || '';
    ctcIn.value          = placement.ctc           || '';
    joiningIn.value      = placement.joining_date  || '';
    renderInterviews(Array.isArray(placement.interviews) ? placement.interviews : []);
  }

  function renderInterviews(interviews) {
    interviewCount.textContent = interviews.length ? `(${interviews.length})` : '';
    if (!interviews.length) {
      interviewList.innerHTML = `<div style="text-align:center;padding:24px;color:#9aa5b1;font-size:13px">No interview entries yet.</div>`;
      return;
    }
    interviewList.innerHTML = [...interviews].reverse().map(i => `
      <div class="pg-prf-interview-card">
        <div class="pg-prf-interview-dot ${i.result}"></div>
        <div class="pg-prf-interview-info">
          <div class="pg-prf-interview-company">${escHtml(i.company)}${i.role ? ` — ${escHtml(i.role)}` : ''}</div>
          <div class="pg-prf-interview-meta">${i.round ? escHtml(i.round) + ' · ' : ''}${i.date || 'No date'}</div>
        </div>
        <span class="pg-prf-interview-badge ${i.result}">${i.result}</span>
        <button class="pg-prf-interview-remove" data-id="${i.id}" aria-label="Remove entry" title="Remove">×</button>
      </div>
    `).join('');

    interviewList.querySelectorAll('.pg-prf-interview-remove').forEach(btn => {
      btn.addEventListener('click', () => removeInterview(btn.dataset.id));
    });
  }

  // ── Load data ──────────────────────────────────────────────
  async function loadData() {
    try {
      const data = await apiGet('/api/profile');
      state.profile   = data.profile;
      state.placement = data.placement;
      populateProfile(data.profile);
      populatePlacement(data.placement);
    } catch (e) {
      showStatus(profileStatus, 'error', e.message || 'Could not load profile.');
    }
  }

  // ── Save profile ───────────────────────────────────────────
  async function saveProfile() {
    saveProfileBtn.disabled = true;
    showStatus(profileStatus, 'loading', 'Saving profile…');
    try {
      // Add any pending chip input value
      if (rolesInput.value.trim()) { targetRoles.push(rolesInput.value.trim()); rolesInput.value = ''; rolesCtrl.render(); }
      if (compInput.value.trim()) { targetCompanies.push(compInput.value.trim()); compInput.value = ''; compCtrl.render(); }

      const data = await apiPost('/api/profile', {
        action: 'save-profile',
        name: nameIn.value, rollNo: rollIn.value, email: emailIn.value,
        internship: internIn.value, resumeLink: resumeIn.value,
        targetRoles, targetCompanies
      });
      state.profile = data.profile;
      showStatus(profileStatus, 'success', '✓ Profile saved successfully.');
    } catch (e) {
      showStatus(profileStatus, 'error', e.message || 'Could not save profile.');
    } finally {
      saveProfileBtn.disabled = false;
    }
  }

  // ── Save placement ─────────────────────────────────────────
  async function savePlacement() {
    savePlacementBtn.disabled = true;
    showStatus(placementStatus, 'loading', 'Saving status…');
    try {
      const data = await apiPost('/api/profile', {
        action: 'save-placement',
        status: state.placementStatus,
        offerCompany: offerCompanyIn.value,
        offerRole: offerRoleIn.value,
        ctc: ctcIn.value,
        joiningDate: joiningIn.value
      });
      state.placement = data.placement;
      showStatus(placementStatus, 'success', '✓ Placement status saved.');
    } catch (e) {
      showStatus(placementStatus, 'error', e.message || 'Could not save.');
    } finally {
      savePlacementBtn.disabled = false;
    }
  }

  // ── Interview log ──────────────────────────────────────────
  addInterviewBtn.addEventListener('click', () => {
    addForm.classList.toggle('open');
    if (addForm.classList.contains('open')) document.getElementById('pgPrfIntCompany').focus();
  });
  addCancel.addEventListener('click', () => addForm.classList.remove('open'));

  addSubmit.addEventListener('click', async () => {
    const company = document.getElementById('pgPrfIntCompany').value.trim();
    if (!company) { document.getElementById('pgPrfIntCompany').focus(); return; }
    addSubmit.disabled = true;
    try {
      const data = await apiPost('/api/profile', {
        action: 'add-interview',
        company,
        role:   document.getElementById('pgPrfIntRole').value.trim(),
        round:  document.getElementById('pgPrfIntRound').value.trim(),
        date:   document.getElementById('pgPrfIntDate').value,
        result: document.getElementById('pgPrfIntResult').value
      });
      state.placement = data.placement;
      renderInterviews(Array.isArray(data.placement?.interviews) ? data.placement.interviews : []);
      addForm.classList.remove('open');
      // Reset fields
      ['pgPrfIntCompany','pgPrfIntRole','pgPrfIntRound','pgPrfIntDate'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('pgPrfIntResult').value = 'pending';
    } catch (e) {
      alert(e.message || 'Could not add entry.');
    } finally {
      addSubmit.disabled = false;
    }
  });

  async function removeInterview(id) {
    if (!confirm('Remove this interview entry?')) return;
    try {
      const data = await apiPost('/api/profile', { action: 'remove-interview', interviewId: id });
      state.placement = data.placement;
      renderInterviews(Array.isArray(data.placement?.interviews) ? data.placement.interviews : []);
    } catch (e) { alert(e.message || 'Could not remove.'); }
  }

  // ── Class Board ────────────────────────────────────────────
  async function loadBoard() {
    boardContent.innerHTML = `<div style="padding:32px;text-align:center;color:#9aa5b1"><div class="pg-prf-spinner" style="margin:0 auto 12px"></div>Loading…</div>`;
    try {
      const data = await apiGet('/api/profile?type=board');
      const board = data.board || [];
      if (!board.length) {
        boardContent.innerHTML = `<div class="pg-prf-empty"><strong>No placements recorded yet</strong><p style="font-size:13px;margin-top:4px">Be the first in your batch to mark yourself as placed!</p></div>`;
        return;
      }
      const avgCtc = board.filter(b => b.ctc).reduce((s,b) => s + Number(b.ctc), 0) / board.filter(b => b.ctc).length;
      const topCtc = Math.max(...board.filter(b => b.ctc).map(b => Number(b.ctc)));
      boardContent.innerHTML = `
        <div class="pg-prf-board-stats">
          <div class="pg-prf-board-stat">
            <div class="pg-prf-board-stat-num">${board.length}</div>
            <div class="pg-prf-board-stat-label">Students Placed</div>
          </div>
          <div class="pg-prf-board-stat">
            <div class="pg-prf-board-stat-num">${avgCtc ? avgCtc.toFixed(1) : '—'}</div>
            <div class="pg-prf-board-stat-label">Average CTC (LPA)</div>
          </div>
          <div class="pg-prf-board-stat">
            <div class="pg-prf-board-stat-num">${topCtc ? topCtc.toFixed(1) : '—'}</div>
            <div class="pg-prf-board-stat-label">Highest CTC (LPA)</div>
          </div>
        </div>
        <div class="pg-prf-board-list">
          ${board.map((b, i) => {
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const initial = (b.name || 'A')[0].toUpperCase();
            return `
              <div class="pg-prf-board-card">
                <div class="pg-prf-board-rank ${rankClass}">#${i + 1}</div>
                <div class="pg-prf-board-avatar">${initial}</div>
                <div class="pg-prf-board-info">
                  <div class="pg-prf-board-name">${escHtml(b.name || 'Anonymous')}${b.rollNo ? ` <span style="font-weight:400;font-size:12px;color:#9aa5b1">(${escHtml(b.rollNo)})</span>` : ''}</div>
                  <div class="pg-prf-board-meta">${escHtml(b.offerCompany || '—')} · ${escHtml(b.offerRole || '—')}</div>
                </div>
                <div class="pg-prf-board-ctc">${b.ctc ? b.ctc + ' LPA' : '—'}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (e) {
      boardContent.innerHTML = `<div class="pg-prf-empty"><strong>Could not load board</strong><p style="font-size:13px;margin-top:4px">${escHtml(e.message)}</p></div>`;
    }
  }

  // ── Tab switching ──────────────────────────────────────────
  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    profileTab.style.display   = name === 'profile'   ? '' : 'none';
    placementTab.style.display = name === 'placement' ? '' : 'none';
    boardTab.style.display     = name === 'board'     ? '' : 'none';
    if (name === 'board') loadBoard();
  }
  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ── Open / Close ──────────────────────────────────────────
  function open() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!state.profile && !state.loading) { state.loading = true; loadData().finally(() => { state.loading = false; }); }
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    clearStatus(profileStatus);
    clearStatus(placementStatus);
  }

  trigger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

  saveProfileBtn.addEventListener('click', saveProfile);
  savePlacementBtn.addEventListener('click', savePlacement);

  // ── Show only when logged in ───────────────────────────────
  function syncVis() { wrap.hidden = !getToken(); }
  syncVis();
  const visInterval = setInterval(() => { syncVis(); if (getToken()) clearInterval(visInterval); }, 3000);

})();
