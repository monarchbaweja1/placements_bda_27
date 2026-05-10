(function initGimAiAssistant() {
  const root = document.getElementById('gim-ai-root');
  if (!root || root.dataset.ready === '1') return;
  root.dataset.ready = '1';
  root.className = 'gim-ai-root';

  let sessionId = sessionStorage.getItem('gimAiSessionId') || '';
  let isSending = false;

  root.innerHTML = `
    <button class="gim-ai-launcher" type="button" aria-label="Open AI assistant">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5l1.45 4.12L17.5 9l-4.05 1.38L12 14.5l-1.45-4.12L6.5 9l4.05-1.38L12 3.5z" fill="currentColor"/>
        <path d="M5.8 13.3l.72 2.04 2.02.66-2.02.68-.72 2.02-.72-2.02-2.02-.68 2.02-.66.72-2.04zM18.3 14.2l.58 1.64 1.62.54-1.62.54-.58 1.64-.58-1.64-1.62-.54 1.62-.54.58-1.64z" fill="currentColor" opacity=".88"/>
      </svg>
    </button>
    <section class="gim-ai-panel" aria-label="GIM AI Placement Assistant">
      <div class="gim-ai-head">
        <div class="gim-ai-mark">AI</div>
        <div class="gim-ai-title">
          <strong>Placement Assistant</strong>
          <span id="gimAiScope">Programme-aware prep support</span>
        </div>
        <button class="gim-ai-close" type="button" aria-label="Close AI assistant">×</button>
      </div>
      <div class="gim-ai-messages" id="gimAiMessages">
        <div class="gim-ai-empty">
          Ask about company prep, resume strategy, interview questions, SQL/Python prep, or roadmap planning. Answers are scoped to your selected GIM programme.
        </div>
      </div>
      <div class="gim-ai-foot">
        <form class="gim-ai-form" id="gimAiForm">
          <textarea class="gim-ai-input" id="gimAiInput" rows="1" maxlength="4000" placeholder="Ask a placement prep question..."></textarea>
          <button class="gim-ai-send" id="gimAiSend" type="submit" aria-label="Send message">➜</button>
        </form>
        <div class="gim-ai-note">AI can make mistakes. Verify important placement decisions with official sources.</div>
      </div>
    </section>
  `;

  const launcher = root.querySelector('.gim-ai-launcher');
  const closeBtn = root.querySelector('.gim-ai-close');
  const form = root.querySelector('#gimAiForm');
  const input = root.querySelector('#gimAiInput');
  const sendBtn = root.querySelector('#gimAiSend');
  const messages = root.querySelector('#gimAiMessages');
  const scope = root.querySelector('#gimAiScope');

  launcher.addEventListener('click', () => {
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
      sessionStorage.setItem('gimAiSessionId', sessionId);
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

  document.addEventListener('gim:programme-change', updateScope);
  setInterval(updateScope, 2500);
  updateScope();

  function setSending(next) {
    isSending = next;
    sendBtn.disabled = next;
    input.disabled = next;
  }

  function addTyping() {
    clearEmpty();
    const wrapper = document.createElement('div');
    wrapper.className = 'gim-ai-message assistant';
    wrapper.innerHTML = '<div class="gim-ai-bubble"><span class="gim-ai-typing"><span></span><span></span><span></span></span></div>';
    messages.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
  }

  function addMessage(role, content, citations) {
    clearEmpty();
    const wrapper = document.createElement('div');
    wrapper.className = `gim-ai-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'gim-ai-bubble';
    bubble.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content);
    wrapper.appendChild(bubble);

    if (role === 'assistant' && citations && citations.length) {
      const citeWrap = document.createElement('div');
      citeWrap.className = 'gim-ai-citations';
      citations.slice(0, 4).forEach(citation => {
        const cite = document.createElement('span');
        cite.className = 'gim-ai-cite';
        cite.textContent = `[${citation.index}] ${citation.title || 'Source'}`;
        citeWrap.appendChild(cite);
      });
      bubble.appendChild(citeWrap);
    }

    messages.appendChild(wrapper);
    scrollToBottom();
  }

  function clearEmpty() {
    messages.querySelector('.gim-ai-empty')?.remove();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function updateScope() {
    const code = getProgrammeCode();
    scope.textContent = code ? `${code.toUpperCase()} scoped assistant` : 'Select a programme to scope answers';
  }

  function getProgrammeCode() {
    if (typeof window.selectedProg === 'string' && window.selectedProg) return window.selectedProg;
    const pill = document.getElementById('progPillName')?.textContent?.trim().toLowerCase();
    if (pill && pill !== 'programme') return pill === 'core' ? 'core' : pill;
    return null;
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
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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
