(function initPlacementAiAssistant() {
  const root = document.getElementById('pg-ai-root');
  if (!root || root.dataset.ready === '1') return;
  root.dataset.ready = '1';
  root.className = 'pg-ai-root';

  let sessionId = sessionStorage.getItem('pgAiSessionId') || '';
  let isSending = false;

  root.innerHTML = `
    <button class="pg-ai-launcher" type="button" aria-label="Open AI assistant">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5l1.45 4.12L17.5 9l-4.05 1.38L12 14.5l-1.45-4.12L6.5 9l4.05-1.38L12 3.5z" fill="currentColor"/>
        <path d="M5.8 13.3l.72 2.04 2.02.66-2.02.68-.72 2.02-.72-2.02-2.02-.68 2.02-.66.72-2.04zM18.3 14.2l.58 1.64 1.62.54-1.62.54-.58 1.64-.58-1.64-1.62-.54 1.62-.54.58-1.64z" fill="currentColor" opacity=".88"/>
      </svg>
    </button>
    <section class="pg-ai-panel" aria-label="AI Placement Assistant">
      <div class="pg-ai-head">
        <div class="pg-ai-mark">AI</div>
        <div class="pg-ai-title">
          <strong>Placement Assistant</strong>
          <span id="pgAiScope">Programme-aware prep support</span>
        </div>
        <button class="pg-ai-close" type="button" aria-label="Close AI assistant">×</button>
      </div>
      <div class="pg-ai-messages" id="pgAiMessages">
        <div class="pg-ai-empty">
          Ask about company prep, resume strategy, interview questions, SQL/Python prep, or roadmap planning. Answers are scoped to your selected programme.
        </div>
      </div>
      <div class="pg-ai-foot">
        <form class="pg-ai-form" id="pgAiForm">
          <textarea class="pg-ai-input" id="pgAiInput" rows="1" maxlength="4000" placeholder="Ask a placement prep question..."></textarea>
          <button class="pg-ai-send" id="pgAiSend" type="submit" aria-label="Send message">➜</button>
        </form>
        <div class="pg-ai-note">AI can make mistakes. Verify important placement decisions with official sources.</div>
      </div>
    </section>
  `;

  const launcher = root.querySelector('.pg-ai-launcher');
  const closeBtn = root.querySelector('.pg-ai-close');
  const form = root.querySelector('#pgAiForm');
  const input = root.querySelector('#pgAiInput');
  const sendBtn = root.querySelector('#pgAiSend');
  const messages = root.querySelector('#pgAiMessages');
  const scope = root.querySelector('#pgAiScope');

  launcher.addEventListener('click', () => {
    if (!isProgrammeViewActive()) return;
    root.classList.add('open');
    updateScope();
    setTimeout(() => input.focus(), 80);
  });

  closeBtn.addEventListener('click', () => root.classList.remove('open'));

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (isSending) return;

    const message = input.value.trim();
    if (!message) return;

    addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
    setSending(true);
    const typing = addTyping();

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please sign in before using the AI assistant.');

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          message,
          programme: getProgrammeCode(),
          pageContext: getPageContext()
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error?.message || 'AI assistant request failed.');
      }

      sessionId = payload.sessionId;
      sessionStorage.setItem('pgAiSessionId', sessionId);
      typing.remove();
      addMessage('assistant', payload.answer, payload.citations || []);
    } catch (error) {
      typing.remove();
      addMessage('assistant', error.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
      input.focus();
    }
  });

  document.addEventListener('placement:programme-change', updateScope);
  setInterval(updateScope, 800);
  updateScope();

  function setSending(next) {
    isSending = next;
    sendBtn.disabled = next;
    input.disabled = next;
  }

  function addTyping() {
    clearEmpty();
    const wrapper = document.createElement('div');
    wrapper.className = 'pg-ai-message assistant';
    wrapper.innerHTML = '<div class="pg-ai-bubble"><span class="pg-ai-typing"><span></span><span></span><span></span></span></div>';
    messages.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
  }

  function addMessage(role, content, citations) {
    clearEmpty();
    const wrapper = document.createElement('div');
    wrapper.className = `pg-ai-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'pg-ai-bubble';
    bubble.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);
    wrapper.appendChild(bubble);

    if (role === 'assistant' && citations && citations.length) {
      const citeWrap = document.createElement('div');
      citeWrap.className = 'pg-ai-citations';
      citations.slice(0, 4).forEach(citation => {
        const cite = document.createElement('span');
        cite.className = 'pg-ai-cite';
        cite.textContent = `[${citation.index}] ${citation.title || 'Source'}`;
        citeWrap.appendChild(cite);
      });
      bubble.appendChild(citeWrap);
    }

    messages.appendChild(wrapper);
    scrollToBottom();
  }

  function clearEmpty() {
    messages.querySelector('.pg-ai-empty')?.remove();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function updateScope() {
    const active = isProgrammeViewActive();
    root.hidden = !active;
    if (!active) {
      root.classList.remove('open');
      scope.textContent = 'Select a programme to scope answers';
      return;
    }

    const code = getProgrammeCode();
    scope.textContent = code ? `${code.toUpperCase()} scoped assistant` : 'Select a programme to scope answers';
  }

  function getProgrammeCode() {
    if (typeof window.selectedProg === 'string' && window.selectedProg) return window.selectedProg;
    const pill = document.getElementById('progPillName')?.textContent?.trim().toLowerCase();
    if (pill && pill !== 'programme') return pill === 'core' ? 'core' : pill;
    return null;
  }

  function isProgrammeViewActive() {
    const app = document.getElementById('mainApp');
    const nav = document.getElementById('mainNav');
    const appVisible = !!app && app.classList.contains('show') && app.style.display !== 'none';
    const navVisible = !!nav && nav.style.display !== 'none';
    return appVisible && navVisible && !!getProgrammeCode();
  }

  function getPageContext() {
    const activeSection = document.querySelector('.app-section.active');
    return {
      section: activeSection?.id || '',
      company: document.querySelector('.company-card.open .company-name')?.textContent?.trim() || '',
      role: document.querySelector('.role-process-card.open .role-title')?.textContent?.trim() || ''
    };
  }

  async function getAccessToken() {
    if (!window.sbIndex?.auth?.getSession) return null;
    const { data } = await window.sbIndex.auth.getSession();
    return data?.session?.access_token || null;
  }

  function renderMarkdown(text) {
    const escaped = escapeHtml(text || '');
    const blocks = escaped.split(/\n{2,}/).map(block => {
      const lines = block.split('\n');
      if (lines.every(line => /^[-*]\s+/.test(line.trim()))) {
        return `<ul>${lines.map(line => `<li>${line.replace(/^[-*]\s+/, '')}</li>`).join('')}</ul>`;
      }
      if (lines.every(line => /^\d+\.\s+/.test(line.trim()))) {
        return `<ol>${lines.map(line => `<li>${line.replace(/^\d+\.\s+/, '')}</li>`).join('')}</ol>`;
      }
      return `<p>${lines.join('<br>')}</p>`;
    }).join('');

    return blocks
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
