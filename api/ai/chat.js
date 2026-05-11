import { randomUUID } from 'node:crypto';
import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { getAiModels, getOpenAIClient } from '../shared/openai.js';
import { assertProgrammeAccess, normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { embedText, retrieveProgrammeChunks } from '../shared/rag.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

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

    const { supabase, access } = await resolveChatAccess({
      userId: auth.user.id,
      requestedProgramme: selectedProgramme
    });

    if (!access.programmeCode) {
      return sendJson(res, 409, {
        ok: false,
        error: {
          code: 'programme_required',
          message: 'Please select or assign a programme before using the AI assistant.'
        }
      });
    }

    const chatSession = await ensureChatSessionSafe({
      supabase,
      sessionId,
      userId: auth.user.id,
      programmeId: access.userContext.programme?.id,
      firstMessage: message
    });

    const history = await loadChatHistorySafe(supabase, chatSession.id);
    const chunks = await retrieveChunksSafe({
      supabase,
      message,
      pageContext,
      history,
      programmeCode: access.programmeCode,
      matchCount: 8
    });

    const answer = await generateAnswerSafe({
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

    await saveChatTurnSafe({
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

async function resolveChatAccess({ userId, requestedProgramme }) {
  const fallbackProgramme = normalizeProgrammeCode(requestedProgramme) || 'bda';
  const fallbackAccess = {
    ok: true,
    programmeCode: fallbackProgramme,
    userContext: { programme: null }
  };

  if (!hasSupabaseServiceRole()) {
    return { supabase: null, access: fallbackAccess };
  }

  try {
    const supabase = getSupabaseAdmin();
    const access = await assertProgrammeAccess({
      supabase,
      userId,
      requestedProgramme,
      requireAssignedProgramme: false
    });

    if (!access.ok) {
      logWarn('chat_programme_access_fallback', {
        userId,
        code: access.error?.code,
        requestedProgramme: fallbackProgramme
      });
      return { supabase, access: fallbackAccess };
    }

    return {
      supabase,
      access: {
        ...access,
        programmeCode: access.programmeCode || fallbackProgramme
      }
    };
  } catch (error) {
    logWarn('chat_programme_lookup_failed', {
      userId,
      message: error?.message || String(error),
      requestedProgramme: fallbackProgramme
    });
    return { supabase: null, access: fallbackAccess };
  }
}

async function ensureChatSessionSafe({ supabase, sessionId, userId, programmeId, firstMessage }) {
  if (!supabase) {
    return {
      id: sessionId || randomUUID(),
      user_id: userId,
      programme_id: programmeId || null
    };
  }

  try {
    return await ensureChatSession({ supabase, sessionId, userId, programmeId, firstMessage });
  } catch (error) {
    logWarn('chat_session_fallback', {
      userId,
      message: error?.message || String(error)
    });
    return {
      id: sessionId || randomUUID(),
      user_id: userId,
      programme_id: programmeId || null
    };
  }
}

async function loadChatHistorySafe(supabase, sessionId) {
  if (!supabase || !sessionId) return [];
  try {
    return await loadChatHistory(supabase, sessionId);
  } catch (error) {
    logWarn('chat_history_load_failed', {
      sessionId,
      message: error?.message || String(error)
    });
    return [];
  }
}

async function retrieveChunksSafe({ supabase, message, pageContext, history, programmeCode, matchCount }) {
  if (!supabase || !process.env.OPENAI_API_KEY) return [];

  try {
    const queryEmbedding = await embedText(buildRetrievalQuery(message, pageContext, history));
    return await retrieveProgrammeChunks({
      supabase,
      queryEmbedding,
      programmeCode,
      matchCount
    });
  } catch (error) {
    logWarn('chat_retrieval_failed', {
      programmeCode,
      message: error?.message || String(error)
    });
    return [];
  }
}

async function generateAnswerSafe({ message, pageContext, history, chunks, programmeCode }) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackAnswer({ message, pageContext, programmeCode });
  }

  try {
    return await generateAnswer({ message, pageContext, history, chunks, programmeCode });
  } catch (error) {
    logWarn('chat_openai_failed', {
      programmeCode,
      message: error?.message || String(error)
    });
    return buildFallbackAnswer({ message, pageContext, programmeCode });
  }
}

async function saveChatTurnSafe({ supabase, sessionId, userMessage, assistantMessage, citations }) {
  if (!supabase || !sessionId) return;
  try {
    await saveChatTurn({ supabase, sessionId, userMessage, assistantMessage, citations });
  } catch (error) {
    logWarn('chat_turn_save_failed', {
      sessionId,
      message: error?.message || String(error)
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

function buildFallbackAnswer({ message, pageContext, programmeCode }) {
  const code = String(programmeCode || 'bda').toUpperCase();
  const lower = String(message || '').toLowerCase();
  const contextParts = [pageContext?.company, pageContext?.role, pageContext?.section].filter(Boolean);
  const contextLine = contextParts.length
    ? `I am using your current page context: ${contextParts.join(' / ')}.`
    : 'I do not have a specific company card open, so this is a general preparation answer.';

  if (/\b(resume|cv|ats)\b/.test(lower)) {
    return [
      `For ${code}, focus your resume on role-fit evidence, not just responsibilities.`,
      contextLine,
      '',
      '1. Put your strongest 3-5 technical or domain skills near the top.',
      '2. Rewrite project bullets with action, tool, method, and measurable result.',
      '3. Add keywords from target roles, such as analytics, dashboarding, modelling, consulting, sales, finance, or operations depending on the programme.',
      '4. Keep each bullet interview-defensible: be ready to explain the data, method, trade-offs, and business impact.',
      '5. Remove generic claims unless they are backed by a project, internship, certification, or metric.'
    ].join('\n');
  }

  if (/\b(interview|question|prep|prepare)\b/.test(lower)) {
    return [
      `For ${code} interview prep, use a three-layer plan.`,
      contextLine,
      '',
      '1. Company layer: know the business model, customers, major products, and why the role exists.',
      '2. Role layer: prepare 2-3 projects that prove the skills the role needs.',
      '3. Story layer: keep STAR answers ready for teamwork, conflict, failure, leadership, and pressure.',
      '',
      'For every project, prepare: problem statement, data/source, approach, tools used, result, and what you would improve.'
    ].join('\n');
  }

  if (/\b(sql|python|power bi|tableau|excel|machine learning|ml)\b/.test(lower)) {
    return [
      `For ${code} technical preparation, prioritize practical fluency.`,
      contextLine,
      '',
      '1. SQL: joins, grouping, window functions, CTEs, date logic, and business case queries.',
      '2. Python/Excel: cleaning, aggregation, charts, basic modelling, and explaining outputs clearly.',
      '3. BI tools: dashboard layout, KPI choice, drill-down logic, and stakeholder storytelling.',
      '4. ML, if relevant: regression/classification basics, evaluation metrics, leakage, overfitting, and business interpretation.',
      '',
      'A good answer should explain both the method and the business decision it supports.'
    ].join('\n');
  }

  return [
    `Here is a practical ${code} placement-prep way to approach this.`,
    contextLine,
    '',
    '1. Clarify the target role and what the recruiter is likely testing.',
    '2. Match your resume evidence to that role using projects, internships, tools, and measurable outcomes.',
    '3. Prepare one technical story, one business story, and one teamwork/leadership story.',
    '4. For company-specific prep, connect your answer to the company sector, customers, and likely use cases.',
    '5. End answers with a crisp impact statement: what changed because of your work.',
    '',
    'The live AI context service was unavailable, so this response is a safe fallback rather than a retrieved-context answer.'
  ].join('\n');
}
