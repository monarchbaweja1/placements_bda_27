(function initStudyTools() {
  'use strict';

  // ── Auth helper ────────────────────────────────────────────────
  function getToken() {
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (k) { const d = JSON.parse(localStorage.getItem(k) || '{}'); return d?.access_token || null; }
    } catch {}
    return window._accessToken || null;
  }

  // ── Dynamic script loader ──────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // ── Universal file → text extractor ───────────────────────────
  async function extractTextFromFile(file, maxChars) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve((e.target.result || '').slice(0, maxChars));
        r.onerror = () => reject(new Error('Could not read file.'));
        r.readAsText(file);
      });
    }

    if (ext === 'pdf') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str).join(' ') + '\n';
        if (text.length >= maxChars) break;
      }
      return text.slice(0, maxChars);
    }

    if (ext === 'docx') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      const buf    = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
      return (result.value || '').slice(0, maxChars);
    }

    if (ext === 'doc') {
      throw new Error('.doc (old Word format) is not supported. Please save as .docx or .txt and retry.');
    }

    throw new Error('Unsupported file type. Please use .pdf, .docx, or .txt');
  }

  // ── Char count helper ──────────────────────────────────────────
  function bindCharCount(textarea, display, max) {
    function update() {
      const n = textarea.value.length;
      display.textContent = `${n} / ${max}`;
      display.className = 'ai-char-count' + (n > max * 0.9 ? ' ai-char-warn' : '');
    }
    textarea.addEventListener('input', update);
    update();
  }

  // ── Modal factory ──────────────────────────────────────────────
  function createModal(id, iconClass, iconEmoji, title, sub, extraClass, bodyHtml) {
    const backdrop = document.createElement('div');
    backdrop.className = 'tool-modal-backdrop' + (extraClass ? ' ' + extraClass : '');
    backdrop.id = id;
    backdrop.innerHTML = `
      <div class="tool-modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="tool-modal-head">
          <div class="tool-modal-head-icon ${iconClass}">${iconEmoji}</div>
          <div style="flex:1">
            <div class="tool-modal-head-title">${title}</div>
            <div class="tool-modal-head-sub">${sub}</div>
          </div>
          <button class="tool-modal-close" type="button" aria-label="Close">&#215;</button>
        </div>
        ${bodyHtml}
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.tool-modal-close').addEventListener('click', () => closeModal(backdrop));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(backdrop); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal(backdrop); });
    return backdrop;
  }

  function openModal(backdrop) {
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(backdrop) {
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ════════════════════════════════════════════
     1. WHITEBOARD
  ════════════════════════════════════════════ */
  let wbModal = null;
  const WB_INIT_HEIGHT  = 2000;
  const WB_EXPAND_BY    = 1500;
  const WB_EXPAND_AHEAD = 300;

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  function wbUid()        { return window._verifiedUid || 'guest'; }
  function wbDraftKey()   { return 'gim_wb_draft_'  + wbUid(); }
  function wbBoardsKey()  { return 'gim_wb_boards_' + wbUid(); }

  function getBoards() {
    try { return JSON.parse(localStorage.getItem(wbBoardsKey()) || '[]'); } catch { return []; }
  }
  function setBoards(boards) {
    try { localStorage.setItem(wbBoardsKey(), JSON.stringify(boards)); } catch {}
  }

  function makeThumbnail(srcCanvas) {
    const TW = 260, TH = 130;
    const t = document.createElement('canvas');
    t.width = TW; t.height = TH;
    const tc = t.getContext('2d');
    tc.fillStyle = '#fff';
    tc.fillRect(0, 0, TW, TH);
    tc.drawImage(srcCanvas, 0, 0, TW, TH);
    return t.toDataURL('image/jpeg', 0.7);
  }

  function flatCanvas(srcCanvas) {
    const t = document.createElement('canvas');
    t.width = srcCanvas.width; t.height = srcCanvas.height;
    const tc = t.getContext('2d');
    tc.fillStyle = '#fff';
    tc.fillRect(0, 0, t.width, t.height);
    tc.drawImage(srcCanvas, 0, 0);
    return t;
  }

  function initWhiteboard() {
    wbModal = createModal(
      'toolWbModal',
      'tool-card-icon wb',
      '✏️',
      'Digital Whiteboard',
      'Draw, sketch and annotate — infinite · named saves · stylus supported',
      'wb-modal',
      `
      <div class="wb-toolbar" id="wbToolbar">
        <button class="wb-btn active" id="wbPenBtn">✏️ Pen</button>
        <button class="wb-btn" id="wbEraserBtn">◻ Eraser</button>
        <div class="wb-sep"></div>
        <span style="font-size:11px;color:#7b8794;font-weight:600">Color:</span>
        ${['#1f2933','#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#fff'].map(c =>
          `<button class="wb-color-swatch${c==='#1f2933'?' active':''}" data-color="${c}" style="background:${c};${c==='#fff'?'border:2px solid #ccc':''}" title="${c}"></button>`
        ).join('')}
        <div class="wb-sep"></div>
        <span style="font-size:11px;color:#7b8794;font-weight:600">Size:</span>
        <button class="wb-size-btn active" data-size="3">S</button>
        <button class="wb-size-btn" data-size="6">M</button>
        <button class="wb-size-btn" data-size="12">L</button>
        <button class="wb-size-btn" data-size="22">XL</button>
        <div class="wb-sep"></div>
        <button class="wb-btn" id="wbUndoBtn">↩ Undo</button>
        <button class="wb-btn" id="wbClearBtn">🗑 Clear</button>
        <div class="wb-sep"></div>
        <div class="wb-save-dialog" id="wbSaveDialog">
          <input class="wb-save-input" id="wbSaveInput" maxlength="40" placeholder="Board name…">
          <button class="wb-save-ok" id="wbSaveOk">Save</button>
          <button class="wb-save-cancel" id="wbSaveCancel">×</button>
        </div>
        <button class="wb-btn" id="wbSaveAsBtn">💾 Save</button>
        <button class="wb-btn" id="wbBoardsBtn" style="margin-left:4px">📂 My Boards</button>
        <span class="wb-saved-indicator" id="wbSavedIndicator" style="margin-left:8px"></span>
      </div>
      <div class="tool-modal-body" style="padding:0;overflow:hidden;position:relative">
        <div class="wb-canvas-wrap" id="wbCanvasWrap">
          <canvas id="wbCanvas"></canvas>
        </div>
        <!-- Boards panel -->
        <div class="wb-boards-panel" id="wbBoardsPanel">
          <div class="wb-boards-head">
            <span class="wb-boards-head-title">📂 My Saved Boards</span>
            <button class="wb-boards-close" id="wbBoardsClose">×</button>
          </div>
          <div class="wb-boards-list" id="wbBoardsList"></div>
        </div>
      </div>`
    );

    const canvas   = document.getElementById('wbCanvas');
    const ctx      = canvas.getContext('2d');
    const wrap     = document.getElementById('wbCanvasWrap');
    const savedInd = document.getElementById('wbSavedIndicator');
    const panel    = document.getElementById('wbBoardsPanel');

    let drawing = false, color = '#1f2933', size = 3, erasing = false;
    const history = [];
    let boardLoaded = false;

    // ── Draft auto-save ──────────────────────────────────────────
    const debouncedDraft = debounce(() => {
      try {
        localStorage.setItem(wbDraftKey(), flatCanvas(canvas).toDataURL('image/jpeg', 0.82));
        savedInd.textContent = '✓ Auto-saved';
        setTimeout(() => { savedInd.textContent = ''; }, 2000);
      } catch {}
    }, 1500);

    function loadDraft() {
      const data = localStorage.getItem(wbDraftKey());
      if (!data) return;
      const img = new Image();
      img.onload = () => {
        if (img.height > canvas.height) {
          canvas.height = img.height;
          canvas.style.height = img.height + 'px';
        }
        ctx.drawImage(img, 0, 0);
      };
      img.src = data;
    }

    // ── Resize (width only) ───────────────────────────────────────
    function resize() {
      const w = wrap.clientWidth || 900;
      if (canvas.width === w) return;
      const currentH = canvas.height || WB_INIT_HEIGHT;
      const img = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, currentH) : null;
      canvas.width        = w;
      canvas.height       = currentH;
      canvas.style.width  = w + 'px';
      canvas.style.height = currentH + 'px';
      if (img) ctx.putImageData(img, 0, 0);
      if (!boardLoaded) { boardLoaded = true; loadDraft(); }
    }

    // ── Auto-expand near bottom ───────────────────────────────────
    function expandIfNeeded(y) {
      if (y < canvas.height - WB_EXPAND_AHEAD) return;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const newH = canvas.height + WB_EXPAND_BY;
      canvas.height = newH;
      canvas.style.height = newH + 'px';
      ctx.putImageData(img, 0, 0);
    }

    canvas.height = WB_INIT_HEIGHT;
    canvas.style.height = WB_INIT_HEIGHT + 'px';
    new ResizeObserver(resize).observe(wrap);
    setTimeout(resize, 50);

    // ── Drawing ───────────────────────────────────────────────────
    function saveHistory() {
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (history.length > 30) history.shift();
    }
    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    }
    function startDraw(e) {
      e.preventDefault();
      saveHistory(); drawing = true;
      const { x, y } = getPos(e);
      ctx.beginPath(); ctx.moveTo(x, y);
      if (erasing) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = size * 4;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size * (0.5 + (e.pressure ?? 0.5));
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    function moveDraw(e) {
      e.preventDefault();
      if (!drawing) return;
      const { x, y } = getPos(e);
      expandIfNeeded(y);
      if (e.pressure !== undefined && !erasing) ctx.lineWidth = size * (0.5 + Math.min(e.pressure, 1));
      ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y);
    }
    function endDraw(e) {
      e.preventDefault();
      if (!drawing) return;
      drawing = false; ctx.beginPath();
      debouncedDraft();
    }

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', moveDraw);
    canvas.addEventListener('pointerup',   endDraw);
    canvas.addEventListener('pointercancel', endDraw);
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

    // ── Boards panel ──────────────────────────────────────────────
    function renderBoards() {
      const list   = document.getElementById('wbBoardsList');
      const boards = getBoards();
      if (!boards.length) {
        list.innerHTML = '<div class="wb-board-empty">No saved boards yet.<br>Draw something and click <strong>💾 Save</strong>.</div>';
        return;
      }
      list.innerHTML = boards.map(b => `
        <div class="wb-board-card">
          <img class="wb-board-thumb" src="${b.thumb}" alt="${esc(b.name)}">
          <div class="wb-board-info">
            <div class="wb-board-name">${esc(b.name)}</div>
            <div class="wb-board-date">${new Date(b.savedAt).toLocaleString()}</div>
            <div class="wb-board-actions">
              <button class="wb-board-act" data-id="${b.id}" data-action="load">📂 Load</button>
              <button class="wb-board-act" data-id="${b.id}" data-action="dl">⬇ PNG</button>
              <button class="wb-board-act del" data-id="${b.id}" data-action="del">🗑</button>
            </div>
          </div>
        </div>`).join('');

      list.querySelectorAll('.wb-board-act').forEach(btn => {
        btn.addEventListener('click', () => {
          const { id, action } = btn.dataset;
          const boards = getBoards();
          const entry = boards.find(b => b.id === id);
          if (!entry) return;
          if (action === 'load') {
            if (!confirm(`Load "${entry.name}"? Unsaved changes to the current board will be lost.`)) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const img = new Image();
            img.onload = () => {
              if (img.height > canvas.height) { canvas.height = img.height; canvas.style.height = img.height + 'px'; }
              ctx.drawImage(img, 0, 0);
            };
            img.src = entry.data;
            panel.classList.remove('open');
          } else if (action === 'dl') {
            const img = new Image();
            img.onload = () => {
              const t = document.createElement('canvas');
              t.width = img.width; t.height = img.height;
              const tc = t.getContext('2d');
              tc.fillStyle = '#fff'; tc.fillRect(0, 0, t.width, t.height);
              tc.drawImage(img, 0, 0);
              const a = document.createElement('a');
              a.href = t.toDataURL('image/png');
              a.download = entry.name.replace(/[^a-z0-9]/gi,'_') + '.png';
              a.click();
            };
            img.src = entry.data;
          } else if (action === 'del') {
            if (!confirm(`Delete "${entry.name}"?`)) return;
            setBoards(boards.filter(b => b.id !== id));
            renderBoards();
          }
        });
      });
    }

    document.getElementById('wbBoardsBtn').addEventListener('click', () => {
      renderBoards();
      panel.classList.toggle('open');
    });
    document.getElementById('wbBoardsClose').addEventListener('click', () => panel.classList.remove('open'));

    // ── Named save flow ───────────────────────────────────────────
    const saveDialog = document.getElementById('wbSaveDialog');
    const saveInput  = document.getElementById('wbSaveInput');

    document.getElementById('wbSaveAsBtn').addEventListener('click', () => {
      saveDialog.classList.add('open');
      saveInput.value = '';
      saveInput.focus();
    });
    document.getElementById('wbSaveCancel').addEventListener('click', () => saveDialog.classList.remove('open'));
    saveInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') saveDialog.classList.remove('open'); });
    document.getElementById('wbSaveOk').addEventListener('click', doSave);

    function doSave() {
      const name = saveInput.value.trim();
      if (!name) { saveInput.focus(); return; }
      saveDialog.classList.remove('open');
      try {
        const flat   = flatCanvas(canvas);
        const data   = flat.toDataURL('image/jpeg', 0.85);
        const thumb  = makeThumbnail(flat);
        const boards = getBoards();
        boards.unshift({ id: Date.now().toString(36), name, savedAt: new Date().toISOString(), data, thumb });
        if (boards.length > 30) boards.pop(); // keep max 30 boards
        setBoards(boards);
        savedInd.textContent = `✓ Saved as "${name}"`;
        setTimeout(() => { savedInd.textContent = ''; }, 3000);
      } catch (e) {
        alert('Could not save: ' + e.message);
      }
    }

    // ── Toolbar controls ──────────────────────────────────────────
    document.getElementById('wbPenBtn').addEventListener('click', () => {
      erasing = false;
      document.getElementById('wbPenBtn').classList.add('active');
      document.getElementById('wbEraserBtn').classList.remove('active');
      canvas.style.cursor = 'crosshair';
    });
    document.getElementById('wbEraserBtn').addEventListener('click', () => {
      erasing = true;
      document.getElementById('wbEraserBtn').classList.add('active');
      document.getElementById('wbPenBtn').classList.remove('active');
      canvas.style.cursor = 'cell';
    });
    document.querySelectorAll('.wb-color-swatch').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('.wb-color-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        color = s.dataset.color; erasing = false;
        document.getElementById('wbPenBtn').classList.add('active');
        document.getElementById('wbEraserBtn').classList.remove('active');
        canvas.style.cursor = 'crosshair';
      });
    });
    document.querySelectorAll('.wb-size-btn').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('.wb-size-btn').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        size = parseInt(s.dataset.size, 10);
      });
    });
    document.getElementById('wbUndoBtn').addEventListener('click', () => {
      if (!history.length) return;
      ctx.putImageData(history.pop(), 0, 0);
      debouncedDraft();
    });
    document.getElementById('wbClearBtn').addEventListener('click', () => {
      if (!confirm('Clear the whiteboard? The current board will be lost (saved boards are kept).')) return;
      saveHistory();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try { localStorage.removeItem(wbDraftKey()); } catch {}
      savedInd.textContent = '';
    });
  }

  /* ════════════════════════════════════════════
     2. PYTHON COMPILER — Piston API (free, no key)
  ════════════════════════════════════════════ */
  let pyModal = null;
  function initPython() {
    pyModal = createModal(
      'toolPyModal',
      'tool-card-icon py',
      '🐍',
      'Python Compiler',
      'Run Python 3 code directly in your browser — powered by Piston',
      '',
      `
      <div class="tool-modal-body">
        <div class="run-bar">
          <button class="run-btn" id="pyRunBtn">▶ Run</button>
          <span class="run-status" id="pyRunStatus"></span>
        </div>
        <div class="code-layout">
          <div class="code-pane">
            <div class="code-pane-label">Code Editor</div>
            <textarea class="code-editor" id="pyEditor" spellcheck="false" autocomplete="off" placeholder="# Write your Python code here...

print('Hello, World!')

# Try some examples:
nums = [3, 1, 4, 1, 5, 9, 2, 6]
print(sorted(nums))

import math
print(math.pi)
"></textarea>
          </div>
          <div class="code-pane">
            <div class="code-pane-label">Output</div>
            <div class="code-output" id="pyOutput"><span class="code-output-placeholder">Output will appear here after you run the code.</span></div>
          </div>
        </div>
      </div>`
    );

    const runBtn = document.getElementById('pyRunBtn');
    const editor = document.getElementById('pyEditor');
    const output = document.getElementById('pyOutput');
    const status = document.getElementById('pyRunStatus');

    // Tab key in editor
    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = editor.selectionStart;
        editor.value = editor.value.slice(0, s) + '    ' + editor.value.slice(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 4;
      }
    });

    // Ctrl/Cmd+Enter to run
    editor.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPython(); }
    });
    runBtn.addEventListener('click', runPython);

    async function runPython() {
      const code = editor.value.trim();
      if (!code) return;
      runBtn.disabled = true;
      status.innerHTML = '<span class="tool-spinner dark"></span> Running…';
      output.className = 'code-output';
      output.textContent = '';

      try {
        const r = await fetch('https://emkc.org/api/v2/piston/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: 'python',
            version: '3.10.0',
            files: [{ name: 'main.py', content: code }],
            stdin: ''
          })
        });
        if (!r.ok) throw new Error('Piston API error: ' + r.status);
        const data = await r.json();
        const run = data.run || {};
        const out = (run.stdout || '') + (run.stderr ? '\n[stderr]\n' + run.stderr : '');
        if (run.stderr) output.classList.add('has-error');
        output.textContent = out || '(no output)';
        status.textContent = run.code !== null ? `Exited with code ${run.code}` : '';
      } catch (e) {
        output.classList.add('has-error');
        output.textContent = 'Error: ' + (e.message || 'Could not reach Piston API');
        status.textContent = '';
      } finally {
        runBtn.disabled = false;
      }
    }
  }

  /* ════════════════════════════════════════════
     3. SQL PLAYGROUND — sql.js (SQLite in browser)
  ════════════════════════════════════════════ */
  let sqlModal = null;
  let sqlDb = null;
  let sqlLoading = false;

  const SQL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js';
  const SAMPLE_SETUP = `-- Sample database is pre-loaded for you
-- Tables: employees, departments

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT,
  budget REAL
);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  name TEXT,
  role TEXT,
  salary REAL,
  dept_id INTEGER
);
INSERT INTO departments VALUES
  (1,'Engineering',1200000),(2,'Marketing',800000),(3,'HR',500000);
INSERT INTO employees VALUES
  (1,'Aarav Shah','Data Engineer',95000,1),
  (2,'Priya Nair','ML Engineer',110000,1),
  (3,'Rohan Mehta','Marketing Lead',85000,2),
  (4,'Sneha Pillai','HR Manager',75000,3),
  (5,'Vivek Kumar','Data Analyst',80000,1),
  (6,'Ananya Joshi','Content Strategist',70000,2);`;

  const DEFAULT_QUERY = `-- Try some queries:
SELECT e.name, e.role, e.salary, d.name AS department
FROM employees e
JOIN departments d ON e.dept_id = d.id
ORDER BY e.salary DESC;`;

  function initSql() {
    sqlModal = createModal(
      'toolSqlModal',
      'tool-card-icon sql',
      '🗄️',
      'SQL Playground',
      'Run SQL queries against an in-browser SQLite database — no server needed',
      '',
      `
      <div class="tool-modal-body">
        <div class="run-bar">
          <button class="run-btn" id="sqlRunBtn">▶ Run Query</button>
          <span class="run-status" id="sqlRunStatus">Loading SQLite engine…</span>
        </div>
        <div class="code-layout" style="min-height:340px">
          <div class="code-pane">
            <div class="code-pane-label">SQL Editor <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#9aa5b1">(Ctrl+Enter to run)</span></div>
            <textarea class="code-editor" id="sqlEditor" spellcheck="false" autocomplete="off">${DEFAULT_QUERY}</textarea>
          </div>
          <div class="code-pane">
            <div class="code-pane-label">Results</div>
            <div class="sql-results-wrap" id="sqlResults">
              <div class="sql-empty">Run a query to see results here.</div>
            </div>
          </div>
        </div>
      </div>`
    );

    const runBtn = document.getElementById('sqlRunBtn');
    const editor = document.getElementById('sqlEditor');
    const results = document.getElementById('sqlResults');
    const status = document.getElementById('sqlRunStatus');

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = editor.selectionStart;
        editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = s + 2;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSql(); }
    });
    runBtn.addEventListener('click', runSql);

    async function loadSqlJs() {
      if (sqlDb) return true;
      if (sqlLoading) return false;
      sqlLoading = true;
      status.innerHTML = '<span class="tool-spinner dark"></span> Loading SQLite engine…';
      runBtn.disabled = true;

      await new Promise((resolve, reject) => {
        if (window.initSqlJs) { resolve(); return; }
        const s = document.createElement('script');
        s.src = SQL_CDN;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load sql.js'));
        document.head.appendChild(s);
      });

      const SQL = await window.initSqlJs({
        locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
      });
      sqlDb = new SQL.Database();
      sqlDb.run(SAMPLE_SETUP);
      status.textContent = 'SQLite ready — sample DB loaded (employees + departments)';
      runBtn.disabled = false;
      sqlLoading = false;
      return true;
    }

    // Pre-load when modal opens
    sqlModal.addEventListener('click', () => {
      if (!sqlDb && !sqlLoading) loadSqlJs().catch(() => {
        status.textContent = 'Failed to load SQLite. Check your connection.';
      });
    }, { once: true });

    function runSql() {
      if (!sqlDb) { loadSqlJs().then(ok => { if (ok) runSql(); }); return; }
      const query = editor.value.trim();
      if (!query) return;

      try {
        const stmts = sqlDb.exec(query);
        if (!stmts.length) {
          results.innerHTML = '<div class="sql-empty">Query ran successfully (no rows returned).</div>';
          status.textContent = 'OK';
          return;
        }
        let html = '';
        stmts.forEach(stmt => {
          html += '<table class="sql-results-table"><thead><tr>';
          stmt.columns.forEach(c => { html += `<th>${esc(c)}</th>`; });
          html += '</tr></thead><tbody>';
          stmt.values.forEach(row => {
            html += '<tr>';
            row.forEach(cell => { html += `<td>${cell === null ? '<span style="color:#9aa5b1">NULL</span>' : esc(String(cell))}</td>`; });
            html += '</tr>';
          });
          html += `</tbody></table><div style="font-size:11px;color:#9aa5b1;padding:6px 12px">${stmt.values.length} row${stmt.values.length !== 1 ? 's' : ''}</div>`;
        });
        results.innerHTML = html;
        status.textContent = 'OK — ' + stmts.reduce((t, s) => t + s.values.length, 0) + ' row(s)';
      } catch (e) {
        results.innerHTML = `<div class="sql-empty" style="color:#ef4444">SQL Error: ${esc(e.message)}</div>`;
        status.textContent = 'Error';
      }
    }
  }

  /* ════════════════════════════════════════════
     4. AI CHECKER
  ════════════════════════════════════════════ */
  let aicModal = null;
  function initAiCheck() {
    aicModal = createModal(
      'toolAicModal',
      'tool-card-icon aic',
      '🔍',
      'AI Content Detector',
      'Check if a text was written by AI or a human — powered by Gemini',
      '',
      `
      <div class="tool-modal-body">
        <div class="ai-tool-layout">
          <div class="ai-input-section">
            <div class="ai-tool-label">Paste or upload text to analyze</div>
            <textarea class="ai-textarea" id="aicText" maxlength="8000" placeholder="Paste the text you want to check here…"></textarea>
            <div class="ai-upload-row">
              <button class="ai-upload-btn" id="aicUploadBtn">📎 Upload file (txt · pdf · docx)</button>
              <span class="ai-upload-file-name" id="aicFileName">No file selected</span>
              <input class="ai-upload-input" type="file" id="aicFileInput" accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
              <span class="ai-char-count" id="aicCharCount">0 / 8000</span>
            </div>
          </div>
          <div class="ai-actions-row">
            <button class="ai-go-btn" id="aicRunBtn">🔍 Analyze Text</button>
          </div>
          <div class="tool-error" id="aicError"></div>
          <div class="aic-result" id="aicResult">
            <div class="aic-meter-wrap">
              <div class="aic-meter-label">
                <span>Human</span>
                <span id="aicProb">—</span>
                <span>AI</span>
              </div>
              <div class="aic-meter-bar">
                <div class="aic-meter-fill" id="aicFill" style="width:0%"></div>
              </div>
            </div>
            <div><span class="aic-verdict" id="aicVerdict"></span></div>
            <div class="aic-indicators" id="aicIndicators"></div>
            <div class="aic-explanation" id="aicExplanation"></div>
          </div>
        </div>
      </div>`
    );

    const textarea = document.getElementById('aicText');
    const fileInput = document.getElementById('aicFileInput');
    const fileName  = document.getElementById('aicFileName');
    const runBtn    = document.getElementById('aicRunBtn');
    const errorEl   = document.getElementById('aicError');
    const resultEl  = document.getElementById('aicResult');
    const charCount = document.getElementById('aicCharCount');

    bindCharCount(textarea, charCount, 8000);

    document.getElementById('aicUploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      fileName.textContent = f.name + ' — extracting…';
      hideErr(errorEl);
      try {
        const text = await extractTextFromFile(f, 8000);
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
        fileName.textContent = f.name;
      } catch (e) {
        fileName.textContent = 'Error';
        showErr(aicModal, errorEl, e.message);
      }
      fileInput.value = '';
    });

    runBtn.addEventListener('click', analyzeText);

    async function analyzeText() {
      const text = textarea.value.trim();
      if (!text) { showErr(aicModal, errorEl, 'Please enter or upload some text first.'); return; }
      const token = getToken();
      if (!token) { showErr(aicModal, errorEl, 'Please sign in to use this tool.'); return; }

      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="tool-spinner"></span> Analyzing…';
      hideErr(errorEl);
      resultEl.classList.remove('visible');

      try {
        const r = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'ai-check', text })
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data?.error?.message || 'Analysis failed.');

        const res = data.result;
        const prob = Math.min(100, Math.max(0, res.probability || 0));

        document.getElementById('aicProb').textContent = prob + '% AI';
        const fill = document.getElementById('aicFill');
        fill.style.width = prob + '%';
        fill.className = 'aic-meter-fill' + (prob >= 70 ? ' high' : prob >= 40 ? ' medium' : '');

        const verdict = document.getElementById('aicVerdict');
        const vClass = prob >= 60 ? 'ai' : prob >= 35 ? 'uncertain' : 'human';
        verdict.className = 'aic-verdict ' + vClass;
        verdict.textContent = res.verdict || (prob >= 60 ? '🤖 Likely AI' : prob >= 35 ? '❓ Uncertain' : '✍️ Likely Human');

        const indEl = document.getElementById('aicIndicators');
        indEl.innerHTML = (res.indicators || []).map(i => `<span class="aic-indicator-tag">${esc(i)}</span>`).join('');

        document.getElementById('aicExplanation').textContent = res.explanation || '';
        resultEl.classList.add('visible');
      } catch (e) {
        showErr(aicModal, errorEl, e.message || 'Analysis failed. Please try again.');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '🔍 Analyze Text';
      }
    }
  }

  /* ════════════════════════════════════════════
     5. AI REPHRASE
  ════════════════════════════════════════════ */
  let airModal = null;
  function initAiRephrase() {
    airModal = createModal(
      'toolAirModal',
      'tool-card-icon air',
      '✨',
      'AI Rephraser',
      'Rephrase your text in different tones — powered by Gemini',
      '',
      `
      <div class="tool-modal-body">
        <div class="ai-tool-layout">
          <div class="ai-input-section">
            <div class="ai-tool-label">Paste or upload text to rephrase</div>
            <textarea class="ai-textarea" id="airText" maxlength="6000" placeholder="Paste the text you want to rephrase here…"></textarea>
            <div class="ai-upload-row">
              <button class="ai-upload-btn" id="airUploadBtn">📎 Upload file (txt · pdf · docx)</button>
              <span class="ai-upload-file-name" id="airFileName">No file selected</span>
              <input class="ai-upload-input" type="file" id="airFileInput" accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
              <span class="ai-char-count" id="airCharCount">0 / 6000</span>
            </div>
          </div>
          <div class="ai-actions-row">
            <select class="ai-mode-select" id="airMode">
              <option value="professional">💼 Professional</option>
              <option value="academic">🎓 Academic</option>
              <option value="simplified">💡 Simplified</option>
              <option value="creative">🎨 Creative</option>
              <option value="formal">📋 Formal</option>
            </select>
            <button class="ai-go-btn" id="airRunBtn">✨ Rephrase</button>
          </div>
          <div class="tool-error" id="airError"></div>
          <div class="air-result" id="airResult">
            <div class="air-result-head">
              <div class="air-result-label" id="airResultLabel">Rephrased Text</div>
              <button class="air-copy-btn" id="airCopyBtn">📋 Copy</button>
            </div>
            <div class="air-output" id="airOutput"></div>
          </div>
        </div>
      </div>`
    );

    const textarea = document.getElementById('airText');
    const fileInput = document.getElementById('airFileInput');
    const fileName  = document.getElementById('airFileName');
    const runBtn    = document.getElementById('airRunBtn');
    const errorEl   = document.getElementById('airError');
    const resultEl  = document.getElementById('airResult');
    const charCount = document.getElementById('airCharCount');
    const modeEl    = document.getElementById('airMode');

    bindCharCount(textarea, charCount, 6000);

    document.getElementById('airUploadBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      fileName.textContent = f.name + ' — extracting…';
      hideErr(errorEl);
      try {
        const text = await extractTextFromFile(f, 6000);
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
        fileName.textContent = f.name;
      } catch (e) {
        fileName.textContent = 'Error';
        showErr(airModal, errorEl, e.message);
      }
      fileInput.value = '';
    });

    runBtn.addEventListener('click', doRephrase);
    document.getElementById('airCopyBtn').addEventListener('click', () => {
      const out = document.getElementById('airOutput').textContent;
      navigator.clipboard?.writeText(out).then(() => {
        const btn = document.getElementById('airCopyBtn');
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 1800);
      });
    });

    async function doRephrase() {
      const text = textarea.value.trim();
      if (!text) { showErr(airModal, errorEl, 'Please enter or upload some text first.'); return; }
      const token = getToken();
      if (!token) { showErr(airModal, errorEl, 'Please sign in to use this tool.'); return; }

      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="tool-spinner"></span> Rephrasing…';
      hideErr(errorEl);
      resultEl.classList.remove('visible');

      try {
        const r = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'rephrase', text, mode: modeEl.value })
        });
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data?.error?.message || 'Rephrase failed.');

        document.getElementById('airOutput').textContent = data.rephrased || '';
        const modeLabel = modeEl.options[modeEl.selectedIndex].text;
        document.getElementById('airResultLabel').textContent = `Rephrased — ${modeLabel} tone`;
        resultEl.classList.add('visible');
      } catch (e) {
        showErr(airModal, errorEl, e.message || 'Rephrase failed. Please try again.');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '✨ Rephrase';
      }
    }
  }

  /* ════════════════════════════════════════════
     UTILS
  ════════════════════════════════════════════ */
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function showErr(modal, el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
  }
  function hideErr(el) {
    el.classList.remove('visible');
  }

  /* ════════════════════════════════════════════
     TOOL CARDS (rendered into #toolsGrid)
  ════════════════════════════════════════════ */
  const TOOLS = [
    { id:'wb',  icon:'wb',  emoji:'✏️', title:'Whiteboard',         desc:'Sketch, annotate and brainstorm with stylus or touch support.', open:() => openModal(wbModal) },
    { id:'py',  icon:'py',  emoji:'🐍', title:'Python Compiler',    desc:'Write and run Python 3 code instantly — no setup needed.', open:() => openModal(pyModal) },
    { id:'sql', icon:'sql', emoji:'🗄️', title:'SQL Playground',     desc:'Run SQL queries on a real in-browser SQLite database.', open:() => openModal(sqlModal) },
    { id:'aic', icon:'aic', emoji:'🔍', title:'AI Content Detector',desc:'Check if text was written by AI or a human.', open:() => openModal(aicModal) },
    { id:'air', icon:'air', emoji:'✨', title:'AI Rephraser',       desc:'Rephrase text in Professional, Academic, Creative or Formal tones.', open:() => openModal(airModal) }
  ];

  function renderToolCards() {
    const grid = document.getElementById('toolsGrid');
    if (!grid) return;
    grid.innerHTML = TOOLS.map(t => `
      <div class="tool-card reveal" data-tool="${t.id}" tabindex="0" role="button" aria-label="Open ${t.title}">
        <div class="tool-card-icon ${t.icon}">${t.emoji}</div>
        <div class="tool-card-title">${t.title}</div>
        <div class="tool-card-desc">${t.desc}</div>
      </div>
    `).join('');

    grid.querySelectorAll('.tool-card').forEach(card => {
      const id = card.dataset.tool;
      const tool = TOOLS.find(t => t.id === id);
      card.addEventListener('click', () => tool?.open());
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tool?.open(); } });
    });
  }

  /* ════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════ */
  function boot() {
    initWhiteboard();
    initPython();
    initSql();
    initAiCheck();
    initAiRephrase();
    renderToolCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
