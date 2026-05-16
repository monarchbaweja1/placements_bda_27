(function initPeerChat() {
  'use strict';

  const PRESENCE_CHANNEL = 'pg-peer-presence-v1';
  const MSG_CHANNEL      = 'pg-peer-messages-v1';
  const FILE_BUCKET      = 'chat-files';
  const MAX_FILE_MB      = 10;
  const MAX_WINDOWS      = 3;
  const HISTORY_LIMIT    = 60;
  const INVISIBLE_KEY    = 'pg-chat-invisible';

  // ── State ────────────────────────────────────────────────────────
  let myUid        = null;
  let myName       = null;
  let myEmail      = null;
  let myAvatarUrl  = null;
  let presenceCh   = null;
  let msgCh        = null;
  let onlineUsers  = {};   // uid → { user_id, name, email, avatar_url }
  let openWindows  = [];   // [{ uid, name, email, avatar_url }]
  let msgCache     = {};   // uid → [message, ...]
  let unread       = {};   // uid → count
  let blockedIds   = new Set();
  let isInvisible  = false;
  let panelOpen    = true;
  let initialized  = false;

  // ── Bootstrap ────────────────────────────────────────────────────
  async function init() {
    if (initialized) return;
    if (!window.sbIndex) { setTimeout(init, 600); return; }

    const { data } = await window.sbIndex.auth.getSession();
    const session = data?.session;
    if (!session) { setTimeout(init, 2000); return; }

    myUid       = session.user.id;
    myEmail     = session.user.email;
    isInvisible = localStorage.getItem(INVISIBLE_KEY) === 'true';

    const profile = await fetchMyProfile(session.access_token);
    myName      = profile.name;
    myAvatarUrl = profile.avatar_url;

    await loadBlockedUsers();

    initialized = true;
    buildPanelDOM();
    buildWindowsDOM();
    joinPresence();
    subscribeIncoming();
    loadInitialUnread();
    setInterval(syncVisibility, 900);
    syncVisibility();
  }

  async function fetchMyProfile(token) {
    try {
      const res = await fetch('/api/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      return {
        name:       d.profile?.name       || emailToInitialName(myEmail),
        avatar_url: d.profile?.avatar_url || null
      };
    } catch {
      return { name: emailToInitialName(myEmail), avatar_url: null };
    }
  }

  function emailToInitialName(email) {
    if (!email) return 'User';
    return email.split('@')[0].replace(/[._]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Blocked Users ────────────────────────────────────────────────
  async function loadBlockedUsers() {
    if (!window.sbIndex || !myUid) return;
    try {
      const { data } = await window.sbIndex
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', myUid);
      blockedIds = new Set((data || []).map(r => r.blocked_id));
    } catch {}
  }

  async function blockUser(user) {
    if (!window.sbIndex || !myUid || !user?.uid) return;
    try {
      await window.sbIndex.from('blocked_users').insert({
        blocker_id:    myUid,
        blocked_id:    user.uid,
        blocked_name:  user.name  || null,
        blocked_email: user.email || null
      });
      blockedIds.add(user.uid);
      delete onlineUsers[user.uid];
      closeWindow(user.uid);
      renderPanel();
    } catch {}
  }

  // ── Visibility Toggle ─────────────────────────────────────────────
  function toggleVisibility() {
    isInvisible = !isInvisible;
    localStorage.setItem(INVISIBLE_KEY, isInvisible);
    if (isInvisible) {
      presenceCh?.untrack();
    } else if (presenceCh) {
      presenceCh.track({ user_id: myUid, name: myName, email: myEmail, avatar_url: myAvatarUrl });
    }
    updateVisibilityBtn();
  }

  function updateVisibilityBtn() {
    const btn = document.getElementById('pgPcVisBtn');
    if (!btn) return;
    if (isInvisible) {
      btn.innerHTML = '<span class="pg-pc-vis-dot off"></span>Appear online';
      btn.title = 'You are invisible. Click to appear online.';
      btn.classList.add('invisible');
    } else {
      btn.innerHTML = '<span class="pg-pc-vis-dot"></span>Online';
      btn.title = 'You appear online to others. Click to go invisible.';
      btn.classList.remove('invisible');
    }
  }

  // ── Supabase Presence ────────────────────────────────────────────
  function joinPresence() {
    if (!window.sbIndex?.channel) return;

    presenceCh = window.sbIndex.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: myUid } }
    });

    presenceCh
      .on('presence', { event: 'sync' }, () => {
        const state = presenceCh.presenceState();
        onlineUsers = {};
        Object.values(state).forEach(presences =>
          presences.forEach(p => {
            if (p.user_id && p.user_id !== myUid && !blockedIds.has(p.user_id))
              onlineUsers[p.user_id] = {
                user_id:    p.user_id,
                name:       p.name,
                email:      p.email,
                avatar_url: p.avatar_url || null
              };
          })
        );
        renderPanel();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach(p => {
          if (p.user_id && p.user_id !== myUid && !blockedIds.has(p.user_id))
            onlineUsers[p.user_id] = {
              user_id:    p.user_id,
              name:       p.name,
              email:      p.email,
              avatar_url: p.avatar_url || null
            };
        });
        renderPanel();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach(p => {
          if (p.user_id) delete onlineUsers[p.user_id];
        });
        renderPanel();
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED' && !isInvisible) {
          await presenceCh.track({
            user_id:    myUid,
            name:       myName,
            email:      myEmail,
            avatar_url: myAvatarUrl
          });
        }
      });
  }

  // ── Incoming message subscription ────────────────────────────────
  function subscribeIncoming() {
    if (!window.sbIndex?.channel || !myUid) return;

    msgCh = window.sbIndex
      .channel(MSG_CHANNEL)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${myUid}`
      }, payload => handleIncoming(payload.new))
      .subscribe();
  }

  function handleIncoming(msg) {
    const sid = msg.sender_id;
    if (blockedIds.has(sid)) return;

    if (!msgCache[sid]) msgCache[sid] = [];
    if (!msgCache[sid].some(m => m.id === msg.id)) {
      msgCache[sid].push(msg);
    }

    const isOpen = openWindows.some(w => w.uid === sid);
    if (isOpen) {
      appendBubble(sid, msg);
      markRead([msg.id]);
    } else {
      unread[sid] = (unread[sid] || 0) + 1;
      renderPanel();
    }
  }

  // ── Unread counts ────────────────────────────────────────────────
  async function loadInitialUnread() {
    if (!window.sbIndex || !myUid) return;
    try {
      const { data } = await window.sbIndex
        .from('direct_messages')
        .select('sender_id, id')
        .eq('receiver_id', myUid)
        .eq('is_read', false);
      if (!data) return;
      unread = {};
      data.forEach(m => { unread[m.sender_id] = (unread[m.sender_id] || 0) + 1; });
      renderPanel();
    } catch {}
  }

  async function markRead(ids) {
    if (!ids?.length || !window.sbIndex) return;
    try {
      await window.sbIndex.from('direct_messages').update({ is_read: true }).in('id', ids);
    } catch {}
  }

  async function markUserRead(senderUid) {
    if (!window.sbIndex || !myUid) return;
    try {
      const { data } = await window.sbIndex
        .from('direct_messages')
        .select('id')
        .eq('sender_id', senderUid)
        .eq('receiver_id', myUid)
        .eq('is_read', false);
      if (data?.length) markRead(data.map(m => m.id));
      delete unread[senderUid];
      renderPanel();
    } catch {}
  }

  // ── Build Panel DOM ──────────────────────────────────────────────
  function buildPanelDOM() {
    const el = document.createElement('div');
    el.id = 'pgPcPanel';
    el.className = 'pg-pc-panel';
    el.hidden = true;
    el.innerHTML = `
      <div class="pg-pc-panel-head" id="pgPcPanelHead">
        <span class="pg-pc-online-dot"></span>
        <span class="pg-pc-panel-label" id="pgPcLabel">Online (0)</span>
        <span class="pg-pc-panel-badge" id="pgPcBadge"></span>
        <button class="pg-pc-panel-chevron" id="pgPcChevron" aria-label="Toggle">▲</button>
      </div>
      <div class="pg-pc-panel-body" id="pgPcBody">
        <div class="pg-pc-empty" id="pgPcEmpty">No one else is online right now.</div>
        <div id="pgPcList"></div>
      </div>
      <div class="pg-pc-panel-foot">
        <button class="pg-pc-vis-btn" id="pgPcVisBtn" type="button"></button>
      </div>`;
    document.body.appendChild(el);

    document.getElementById('pgPcPanelHead').addEventListener('click', e => {
      if (e.target.closest('#pgPcChevron') || e.target === e.currentTarget || !e.target.closest('button')) {
        togglePanel();
      }
    });

    document.getElementById('pgPcVisBtn').addEventListener('click', toggleVisibility);
    updateVisibilityBtn();
  }

  function buildWindowsDOM() {
    const el = document.createElement('div');
    el.id = 'pgPcWindows';
    el.className = 'pg-pc-windows';
    el.hidden = true;
    document.body.appendChild(el);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const body  = document.getElementById('pgPcBody');
    const arrow = document.getElementById('pgPcChevron');
    if (body)  body.classList.toggle('collapsed', !panelOpen);
    if (arrow) arrow.textContent = panelOpen ? '▲' : '▼';
  }

  // ── Render Panel ─────────────────────────────────────────────────
  function renderPanel() {
    const label = document.getElementById('pgPcLabel');
    const badge = document.getElementById('pgPcBadge');
    const empty = document.getElementById('pgPcEmpty');
    const list  = document.getElementById('pgPcList');
    if (!label || !list) return;

    const users       = Object.values(onlineUsers).filter(u => !blockedIds.has(u.user_id));
    const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

    label.textContent = `Online (${users.length})`;

    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }
    }

    if (empty) empty.style.display = users.length ? 'none' : '';

    list.innerHTML = users.map(u => {
      const initials  = makeInitials(u.name || u.email);
      const cnt       = unread[u.user_id] || 0;
      const isActive  = openWindows.some(w => w.uid === u.user_id);
      const avatarInner = u.avatar_url
        ? `<img class="pg-pc-avatar-img" src="${x(u.avatar_url)}" alt="${x(initials)}">`
        : x(initials);
      return `
        <div class="pg-pc-user-row${isActive ? ' active' : ''}"
          data-uid="${x(u.user_id)}"
          data-name="${x(u.name || u.email)}"
          data-email="${x(u.email || '')}"
          data-avatar="${x(u.avatar_url || '')}">
          <div class="pg-pc-avatar">${avatarInner}</div>
          <div class="pg-pc-user-info">
            <div class="pg-pc-user-name">${x(u.name || u.email)}</div>
            <div class="pg-pc-user-sub">Online</div>
          </div>
          ${cnt > 0 ? `<div class="pg-pc-unread">${cnt}</div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.pg-pc-user-row').forEach(row => {
      row.addEventListener('click', () => {
        openChatWindow({
          uid:        row.dataset.uid,
          name:       row.dataset.name,
          email:      row.dataset.email,
          avatar_url: row.dataset.avatar || null
        });
      });
    });
  }

  // ── Chat Windows ─────────────────────────────────────────────────
  function openChatWindow(user) {
    const existing = document.querySelector(`.pg-pc-window[data-uid="${user.uid}"]`);
    if (existing) {
      existing.classList.remove('flash');
      void existing.offsetWidth;
      existing.classList.add('flash');
      existing.querySelector('.pg-pc-win-input')?.focus();
      return;
    }

    if (openWindows.length >= MAX_WINDOWS) {
      closeWindow(openWindows[0].uid);
    }

    openWindows.push(user);
    delete unread[user.uid];
    renderPanel();

    createWindowEl(user);
    loadHistory(user.uid);
    markUserRead(user.uid);
  }

  function closeWindow(uid) {
    openWindows = openWindows.filter(w => w.uid !== uid);
    document.querySelector(`.pg-pc-window[data-uid="${uid}"]`)?.remove();
    renderPanel();
  }

  function createWindowEl(user) {
    const container = document.getElementById('pgPcWindows');
    if (!container) return;

    const avatarInner = user.avatar_url
      ? `<img class="pg-pc-avatar-img" src="${x(user.avatar_url)}" alt="${x(makeInitials(user.name))}">`
      : x(makeInitials(user.name));

    const win = document.createElement('div');
    win.className = 'pg-pc-window';
    win.dataset.uid = user.uid;
    win.innerHTML = `
      <div class="pg-pc-win-head">
        <div class="pg-pc-win-avatar">${avatarInner}</div>
        <div class="pg-pc-win-info">
          <div class="pg-pc-win-name">${x(user.name)}</div>
          <div class="pg-pc-win-status">Online</div>
        </div>
        <button class="pg-pc-win-block" aria-label="Block ${x(user.name)}" title="Block ${x(user.name)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </button>
        <button class="pg-pc-win-close" aria-label="Close">&#215;</button>
      </div>
      <div class="pg-pc-messages" id="pgPcMsgs-${user.uid}">
        <div class="pg-pc-msgs-hint">Loading messages…</div>
      </div>
      <div class="pg-pc-win-foot">
        <label class="pg-pc-attach-label" title="Attach file">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
          <input class="pg-pc-file-inp" type="file"
            accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
            style="display:none">
        </label>
        <input class="pg-pc-win-input" type="text" placeholder="Message…" maxlength="2000">
        <button class="pg-pc-win-send" aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>`;

    container.appendChild(win);

    win.querySelector('.pg-pc-win-close').addEventListener('click', () => closeWindow(user.uid));
    win.querySelector('.pg-pc-win-block').addEventListener('click', () => {
      if (confirm(`Block ${user.name}?\n\nYou won't see their messages or online presence. You can unblock them from your Profile.`)) {
        blockUser(user);
      }
    });

    const input   = win.querySelector('.pg-pc-win-input');
    const sendBtn = win.querySelector('.pg-pc-win-send');
    const fileInp = win.querySelector('.pg-pc-file-inp');

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(user.uid); }
    });
    sendBtn.addEventListener('click', () => doSend(user.uid));
    fileInp.addEventListener('change', () => doFileUpload(user.uid, fileInp));

    input.focus();
  }

  // ── Load History ─────────────────────────────────────────────────
  async function loadHistory(otherUid) {
    const box = document.getElementById(`pgPcMsgs-${otherUid}`);
    if (!box || !window.sbIndex || !myUid) return;

    try {
      const { data, error } = await window.sbIndex
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${myUid},receiver_id.eq.${otherUid}),` +
          `and(sender_id.eq.${otherUid},receiver_id.eq.${myUid})`
        )
        .order('created_at', { ascending: true })
        .limit(HISTORY_LIMIT);

      if (error) throw error;

      msgCache[otherUid] = data || [];
      renderMessages(otherUid);
    } catch {
      if (box) box.innerHTML = '<div class="pg-pc-msgs-hint">Say hello!</div>';
    }
  }

  function renderMessages(otherUid) {
    const box  = document.getElementById(`pgPcMsgs-${otherUid}`);
    if (!box) return;
    const user = openWindows.find(w => w.uid === otherUid);
    const msgs = msgCache[otherUid] || [];
    if (!msgs.length) {
      box.innerHTML = '<div class="pg-pc-msgs-hint">No messages yet. Say hello!</div>';
      return;
    }
    box.innerHTML = msgs.map(m => bubbleHTML(m, user)).join('');
    box.scrollTop = box.scrollHeight;
  }

  function appendBubble(otherUid, msg) {
    const box  = document.getElementById(`pgPcMsgs-${otherUid}`);
    if (!box) return;
    const user = openWindows.find(w => w.uid === otherUid);
    box.querySelector('.pg-pc-msgs-hint')?.remove();
    const div = document.createElement('div');
    div.innerHTML = bubbleHTML(msg, user);
    while (div.firstChild) box.appendChild(div.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function bubbleHTML(msg, otherUser) {
    const mine = msg.sender_id === myUid;
    const t    = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let body   = '';

    if (msg.file_url) {
      const isImg = (msg.file_type || '').startsWith('image/');
      if (isImg) {
        body += `<img class="pg-pc-msg-img" src="${x(msg.file_url)}"
          alt="${x(msg.file_name || 'image')}" loading="lazy"
          onclick="window.open('${x(msg.file_url)}','_blank')">`;
      } else {
        body += `<a class="pg-pc-msg-file" href="${x(msg.file_url)}" target="_blank" rel="noopener">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
            <path d="M14 2v6h6"/></svg>
          ${x(msg.file_name || 'File')}
        </a>`;
      }
      if (msg.content) body += `<div class="pg-pc-msg-caption">${x(msg.content)}</div>`;
    } else {
      body = x(msg.content || '');
    }

    let bubbleContent;
    if (!mine && otherUser) {
      const av = otherUser.avatar_url
        ? `<img class="pg-pc-bubble-avatar" src="${x(otherUser.avatar_url)}" alt="">`
        : `<div class="pg-pc-bubble-avatar-i">${x(makeInitials(otherUser.name))}</div>`;
      bubbleContent = `<div class="pg-pc-bubble-row">${av}<div class="pg-pc-bubble">${body}</div></div>`;
    } else {
      bubbleContent = `<div class="pg-pc-bubble">${body}</div>`;
    }

    return `
      <div class="pg-pc-msg ${mine ? 'mine' : 'theirs'}">
        ${bubbleContent}
        <div class="pg-pc-msg-time">${t}</div>
      </div>`;
  }

  // ── Send Message ─────────────────────────────────────────────────
  async function doSend(receiverUid) {
    const win   = document.querySelector(`.pg-pc-window[data-uid="${receiverUid}"]`);
    const input = win?.querySelector('.pg-pc-win-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content || !window.sbIndex || !myUid) return;
    input.value = '';

    const tempId  = 'tmp-' + Date.now();
    const tempMsg = {
      id: tempId, sender_id: myUid, receiver_id: receiverUid,
      content, created_at: new Date().toISOString()
    };

    if (!msgCache[receiverUid]) msgCache[receiverUid] = [];
    msgCache[receiverUid].push(tempMsg);
    appendBubble(receiverUid, tempMsg);

    try {
      const { data, error } = await window.sbIndex
        .from('direct_messages')
        .insert({ sender_id: myUid, receiver_id: receiverUid, content })
        .select().single();

      if (error) throw error;
      const idx = msgCache[receiverUid].findIndex(m => m.id === tempId);
      if (idx !== -1) msgCache[receiverUid][idx] = data;
    } catch {
      msgCache[receiverUid] = msgCache[receiverUid].filter(m => m.id !== tempId);
      renderMessages(receiverUid);
    }
  }

  // ── File Upload ──────────────────────────────────────────────────
  async function doFileUpload(receiverUid, fileInput) {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`Files must be under ${MAX_FILE_MB} MB.`);
      return;
    }

    const box = document.getElementById(`pgPcMsgs-${receiverUid}`);
    const uploadEl = document.createElement('div');
    uploadEl.className = 'pg-pc-msg mine';
    uploadEl.innerHTML = `<div class="pg-pc-bubble"><div class="pg-pc-uploading">Uploading ${x(file.name)}…</div></div>`;
    box?.appendChild(uploadEl);
    if (box) box.scrollTop = box.scrollHeight;

    try {
      if (!window.sbIndex?.storage) throw new Error('Storage not available');

      const ext  = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${myUid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: up, error: upErr } = await window.sbIndex.storage
        .from(FILE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      const { data: { publicUrl } } = window.sbIndex.storage.from(FILE_BUCKET).getPublicUrl(up.path);

      const { data: msg, error: msgErr } = await window.sbIndex
        .from('direct_messages')
        .insert({
          sender_id: myUid, receiver_id: receiverUid,
          file_url: publicUrl, file_name: file.name, file_type: file.type
        })
        .select().single();

      if (msgErr) throw msgErr;

      uploadEl.remove();

      if (!msgCache[receiverUid]) msgCache[receiverUid] = [];
      msgCache[receiverUid].push(msg);
      appendBubble(receiverUid, msg);

    } catch (err) {
      uploadEl.remove();
      const errEl = document.createElement('div');
      errEl.className = 'pg-pc-msg mine';
      errEl.innerHTML = `<div class="pg-pc-bubble" style="background:#7f1d1d;color:#fca5a5">Upload failed: ${x(err.message || 'Please try again.')}</div>`;
      box?.appendChild(errEl);
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  // ── DOM Visibility ────────────────────────────────────────────────
  function syncVisibility() {
    const show    = isActive();
    const panel   = document.getElementById('pgPcPanel');
    const windows = document.getElementById('pgPcWindows');
    if (panel)   panel.hidden   = !show;
    if (windows) windows.hidden = !show;
  }

  function isActive() {
    if (!myUid) return false;
    const app = document.getElementById('mainApp');
    const nav = document.getElementById('mainNav');
    if (!app || !nav) return false;
    return app.classList.contains('show')
      && app.style.display !== 'none'
      && nav.style.display !== 'none'
      && !!(window.selectedProg);
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function makeInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function x(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Start ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }
})();
