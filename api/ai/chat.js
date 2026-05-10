import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { getAiModels, getOpenAIClient } from '../shared/openai.js';
import { assertProgrammeAccess } from '../shared/programmeGuard.js';
import { embedText, retrieveProgrammeChunks } from '../shared/rag.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { getSupabaseAdmin } from '../shared/supabaseAdmin.js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 8;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`ai-chat:${auth.user.id}`, { limit: 12, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: {
          code: 'rate_limited',
          message: 'Too many AI requests. Please try again shortly.'
        }
      });
    }

    const body = req.body || {};
    const message = String(body.message || '').trim();
    const selectedProgramme = body.programme;
    const sessionId = body.sessionId || null;
    const pageContext = sanitizePageContext(body.pageContext);

    if (!message) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'empty_message',
          message: 'Message is required.'
        }
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'message_too_long',
          message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
        }
      });
    }

    const supabase = getSupabaseAdmin();
    const access = await assertProgrammeAccess({
      supabase,
      userId: auth.user.id,
      requestedProgramme: selectedProgramme,
      requireAssignedProgramme: true
    });

    if (!access.ok) return sendJson(res, access.status, { ok: false, error: access.error });
    if (!access.programmeCode) {
      return sendJson(res, 409, {
        ok: false,
        error: {
          code: 'programme_required',
          message: 'Please select or assign a programme before using the AI assistant.'
        }
      });
    }

    const chatSession = await ensureChatSession({
      supabase,
      sessionId,
      userId: auth.user.id,
      programmeId: access.userContext.programme?.id,
      firstMessage: message
    });

    const history = await loadChatHistory(supabase, chatSession.id);
    const queryEmbedding = await embedText(buildRetrievalQuery(message, pageContext, history));
    const chunks = await retrieveProgrammeChunks({
      supabase,
      queryEmbedding,
      programmeCode: access.programmeCode,
      matchCount: 8
    });

    const answer = await generateAnswer({
      message,
      pageContext,
      history,
      chunks,
      programmeCode: access.programmeCode
    });

    const citations = chunks.map((chunk, index) => ({
      index: index + 1,
      documentId: chunk.document_id,
      title: chunk.document_title,
      type: chunk.document_type,
      similarity: Number(chunk.similarity || 0)
    }));

    await saveChatTurn({
      supabase,
      sessionId: chatSession.id,
      userMessage: message,
      assistantMessage: answer,
      citations
    });

    logInfo('ai_chat_completed', {
      userId: auth.user.id,
      programmeCode: access.programmeCode,
      sessionId: chatSession.id,
      retrievedChunks: chunks.length
    });

    return sendJson(res, 200, {
      ok: true,
      sessionId: chatSession.id,
      programme: access.programmeCode,
      answer,
      citations,
      retrieval: {
        chunks: chunks.length,
        hasContext: chunks.length > 0
      }
    });
  } catch (error) {
    logError('ai_chat_failed', error);
    return sendJson(res, 500, {
      ok: false,
      error: {
        code: 'ai_chat_failed',
        message: 'Unable to generate an AI response right now.'
      }
    });
  }
}

async function ensureChatSession({ supabase, sessionId, userId, programmeId, firstMessage }) {
  if (sessionId) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, user_id, programme_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    logWarn('chat_session_not_found', { sessionId, userId });
  }

  const title = firstMessage.slice(0, 72);
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      programme_id: programmeId,
      title
    })
    .select('id, user_id, programme_id')
    .single();

  if (error) throw error;
  return data;
}

async function loadChatHistory(supabase, sessionId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) throw error;
  return (data || []).reverse();
}

async function saveChatTurn({ supabase, sessionId, userMessage, assistantMessage, citations }) {
  const { error } = await supabase
    .from('chat_messages')
    .insert([
      {
        session_id: sessionId,
        role: 'user',
        content: userMessage
      },
      {
        session_id: sessionId,
        role: 'assistant',
        content: assistantMessage,
        citations
      }
    ]);

  if (error) throw error;
}

async function generateAnswer({ message, pageContext, history, chunks, programmeCode }) {
  const { chatModel } = getAiModels();
  const openai = getOpenAIClient();
  const contextBlock = buildContextBlock(chunks);
  const historyBlock = history
    .map(item => `${item.role.toUpperCase()}: ${item.content}`)
    .join('\n\n')
    .slice(-6000);

  const response = await openai.responses.create({
    model: chatModel,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              'You are the GIM Placement Prep Hub AI assistant.',
              'Answer only for the authenticated programme scope.',
              `Current programme: ${programmeCode.toUpperCase()}.`,
              'Use retrieved context when available. If the retrieved context is insufficient, say what is missing and give a cautious general preparation framework.',
              'Never claim shortlist guarantees. Use "estimate" language for probabilities.',
              'Keep answers practical, concise, and student-facing.',
              'For programme-specific questions, do not mix data from other programmes.',
              'When using retrieved context, cite sources as [1], [2], etc.'
            ].join('\n')
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              `Page context: ${JSON.stringify(pageContext)}`,
              historyBlock ? `Recent conversation:\n${historyBlock}` : 'Recent conversation: none',
              contextBlock,
              `Student question:\n${message}`
            ].join('\n\n')
          }
        ]
      }
    ]
  });

  return response.output_text || 'I could not generate a response. Please try again.';
}

function buildContextBlock(chunks) {
  if (!chunks.length) {
    return 'Retrieved programme context: none available yet.';
  }

  return [
    'Retrieved programme context:',
    ...chunks.map((chunk, index) => {
      const source = `${chunk.document_title || 'Untitled'} (${chunk.document_type || 'document'})`;
      return `[${index + 1}] ${source}\n${chunk.content}`;
    })
  ].join('\n\n');
}

function buildRetrievalQuery(message, pageContext, history) {
  const recent = history.slice(-3).map(item => item.content).join('\n');
  return [pageContext?.section, pageContext?.company, pageContext?.role, recent, message]
    .filter(Boolean)
    .join('\n');
}

function sanitizePageContext(pageContext = {}) {
  return {
    section: String(pageContext.section || '').slice(0, 80),
    company: String(pageContext.company || '').slice(0, 120),
    role: String(pageContext.role || '').slice(0, 120)
  };
}
