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

    const generation = await generateAnswerSafe({
      message,
      pageContext,
      history,
      chunks,
      programmeCode: access.programmeCode
    });
    const answer = generation.answer;

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
      },
      ai: {
        provider: generation.provider,
        model: generation.model || null,
        fallback: generation.provider !== 'openai',
        reason: generation.reason || null
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
    return {
      answer: buildFallbackAnswer({ message, pageContext, programmeCode, reason: 'missing_openai_key' }),
      provider: 'fallback',
      reason: 'missing_openai_key'
    };
  }

  try {
    const generated = await generateAnswer({ message, pageContext, history, chunks, programmeCode });
    return {
      answer: generated.answer,
      provider: 'openai',
      model: generated.model,
      reason: null
    };
  } catch (error) {
    logWarn('chat_openai_failed', {
      programmeCode,
      message: error?.message || String(error)
    });
    return {
      answer: buildFallbackAnswer({ message, pageContext, programmeCode, reason: 'openai_request_failed' }),
      provider: 'fallback',
      reason: 'openai_request_failed'
    };
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

  const input = [
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
    ];
  const models = uniqueModels([chatModel, 'gpt-4.1-mini', 'gpt-4.1-nano']);
  let lastError;

  for (const model of models) {
    try {
      const response = await openai.responses.create({ model, input });
      return {
        answer: response.output_text || 'I could not generate a response. Please try again.',
        model
      };
    } catch (error) {
      lastError = error;
      logWarn('chat_model_failed', {
        model,
        message: error?.message || String(error)
      });
    }
  }

  throw lastError || new Error('No OpenAI model response generated.');
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

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean).map(model => String(model).trim()).filter(Boolean))];
}

function sanitizePageContext(pageContext = {}) {
  return {
    section: String(pageContext.section || '').slice(0, 80),
    company: String(pageContext.company || '').slice(0, 120),
    role: String(pageContext.role || '').slice(0, 120)
  };
}

function buildFallbackAnswer({ message, pageContext, programmeCode, reason = 'fallback' }) {
  const code = String(programmeCode || 'bda').toUpperCase();
  const cleanedMessage = normalizeUserMessage(message);
  const lower = cleanedMessage.toLowerCase();
  const contextParts = [pageContext?.company, pageContext?.role, pageContext?.section].filter(Boolean);
  const contextLine = contextParts.length
    ? `I am using your current page context: ${contextParts.join(' / ')}.`
    : 'I do not have a specific company card open, so this is a general preparation answer.';
  const company = extractCompanyName(cleanedMessage, pageContext);
  const role = extractRoleName(cleanedMessage, pageContext);
  const intro = fallbackIntro(code, contextLine);

  if (/\b(placement|placements|placed|campus|job|jobs|recruiter|recruiters|career)\b/.test(lower)) {
    return [
      `${intro} For your placement prep, use this as a 10-day sprint.`,
      '',
      'Day 1: choose 2 target role families and map the skills each needs.',
      'Day 2: fix your resume headline, project bullets, and keywords for those roles.',
      'Day 3: prepare SQL/Excel/Python or domain basics based on the role.',
      'Day 4: write 5 STAR stories: leadership, conflict, failure, pressure, and ownership.',
      'Day 5: pick 8 target companies and make one-page prep notes for each.',
      'Days 6-7: practise technical and HR questions aloud, not just by reading.',
      'Days 8-9: solve company cases or role tasks and time yourself.',
      'Day 10: mock interview, refine weak answers, and prepare questions to ask recruiters.',
      '',
      `Start with this today: send me your target role or one company name, and I can make a focused ${code} prep plan.`
    ].join('\n');
  }

  if (/\b(resume|cv|ats)\b/.test(lower)) {
    return [
      `${intro} For your resume, focus on role-fit evidence, not just responsibilities.`,
      '',
      '1. Put your strongest 3-5 technical or domain skills near the top.',
      '2. Rewrite project bullets with action, tool, method, and measurable result.',
      '3. Add keywords from target roles, such as analytics, dashboarding, modelling, consulting, sales, finance, or operations depending on the programme.',
      '4. Keep each bullet interview-defensible: be ready to explain the data, method, trade-offs, and business impact.',
      '5. Remove generic claims unless they are backed by a project, internship, certification, or metric.'
    ].join('\n');
  }

  if (/\b(shortlist|probability|chance|chances|eligible|eligibility)\b/.test(lower)) {
    return [
      `${intro} For shortlist improvement, work on the signals recruiters can verify quickly.`,
      '',
      '1. CGPA: if it is fixed, do not over-explain it; compensate with projects and certifications.',
      '2. Skills: show evidence for tools in bullets, not only in a skills list.',
      '3. Projects: add problem, data, method, tool, metric, and business impact.',
      '4. Company fit: match your examples to the sector: consulting, analytics, BFSI, FMCG, healthcare, or operations.',
      '5. Interview readiness: one strong project explanation can lift your perceived fit more than adding 10 weak tools.',
      '',
      'If you give me your CGPA, skills, and 3 companies, I can suggest what to improve first.'
    ].join('\n');
  }

  if (/\b(company|companies|target|deloitte|kpmg|ey|accenture|fractal|mu sigma|amazon|jpmorgan|jp morgan|kantar|hul|asian paints)\b/.test(lower) || company) {
    const label = company || 'the company';
    return [
      `${intro} For ${label} prep, build a tight company-fit sheet.`,
      '',
      '1. Business: what the company sells, who its clients/customers are, and where analytics or management work fits.',
      '2. Role fit: list 4 skills the role likely tests and match each to one project or internship example.',
      '3. Sector cases: prepare one case relevant to the sector, such as churn, pricing, dashboarding, risk, sales planning, or customer segmentation.',
      '4. Resume hooks: mark 3 bullets you want the interviewer to ask about.',
      '5. Questions to ask: prepare 2 thoughtful questions about the team, role expectations, or business problem.',
      '',
      `For ${label}, your best answer structure is: context -> your approach -> measurable result -> why it matters to the role.`
    ].join('\n');
  }

  if (/\b(interview|question|questions|hr|tell me about yourself|introduce|prep|prepare)\b/.test(lower)) {
    return [
      `${intro} For interview prep, use a three-layer plan.`,
      '',
      '1. Company layer: know the business model, customers, major products, and why the role exists.',
      '2. Role layer: prepare 2-3 projects that prove the skills the role needs.',
      '3. Story layer: keep STAR answers ready for teamwork, conflict, failure, leadership, and pressure.',
      '',
      'For every project, prepare: problem statement, data/source, approach, tools used, result, and what you would improve.'
    ].join('\n');
  }

  if (/\b(sql|python|power bi|tableau|excel|machine learning|ml|statistics|dashboard|analytics|model|data)\b/.test(lower)) {
    if (/\bpython\b/.test(lower)) {
      return [
        `${intro} For Python placement prep, study the parts interviewers can test through examples.`,
        '',
        '1. Core syntax: lists, dictionaries, sets, tuples, loops, functions, comprehensions, and error handling.',
        '2. Data handling: pandas DataFrame operations, filtering, groupby, merge/join, missing values, sorting, and date handling.',
        '3. Analytics logic: descriptive stats, correlation, basic probability, train/test split, and evaluation metrics.',
        '4. SQL + Python flow: read data, clean it, aggregate it, visualize it, and explain the business finding.',
        '5. Interview coding: string/list problems, frequency counts, top-N logic, duplicates, and simple case-based data tasks.',
        '',
        'Practice task for today: take any CSV, clean 3 columns, make 3 KPIs, and explain the insight in 60 seconds.'
      ].join('\n');
    }

    return [
      `${intro} For technical preparation, prioritize practical fluency.`,
      '',
      '1. SQL: joins, grouping, window functions, CTEs, date logic, and business case queries.',
      '2. Python/Excel: cleaning, aggregation, charts, basic modelling, and explaining outputs clearly.',
      '3. BI tools: dashboard layout, KPI choice, drill-down logic, and stakeholder storytelling.',
      '4. ML, if relevant: regression/classification basics, evaluation metrics, leakage, overfitting, and business interpretation.',
      '',
      'A good answer should explain both the method and the business decision it supports.'
    ].join('\n');
  }

  if (/\b(gd|group discussion|case|case study|aptitude|test|assessment)\b/.test(lower)) {
    return [
      `${intro} For GD/case/assessment rounds, prepare for speed plus structure.`,
      '',
      '1. Aptitude: practise percentages, ratios, averages, probability basics, and data interpretation daily.',
      '2. Case study: start with objective, constraints, data needed, approach, recommendation, and risks.',
      '3. GD: enter early with a useful frame, add examples, summarize others, and avoid repeating points.',
      '4. Written answers: use headings, bullets, assumptions, and a clear final recommendation.',
      '5. Analytics cases: define KPI, segment data, diagnose drivers, propose experiment, and measure impact.'
    ].join('\n');
  }

  if (/\b(internship|experience|project|projects|certification|certificate)\b/.test(lower)) {
    return [
      `${intro} To strengthen projects and experience, make every example recruiter-readable.`,
      '',
      '1. Convert each project into: problem, dataset/process, tools, method, result, and business use.',
      '2. Add numbers where possible: accuracy, time saved, revenue, cost, users, records, or turnaround time.',
      '3. Keep only tools you can explain under questioning.',
      '4. For certifications, mention them only when connected to a project or skill proof.',
      '5. Prepare a 60-second explanation and a 3-minute deep dive for your best project.'
    ].join('\n');
  }

  if (role) {
    return [
      `${intro} For a ${role} role, align your prep to the job evidence recruiters expect.`,
      '',
      '1. Identify the top 5 role skills from job descriptions.',
      '2. Map each skill to one resume bullet or project example.',
      '3. Prepare one technical answer, one business impact answer, and one teamwork answer.',
      '4. Practise explaining your strongest project without reading from your resume.',
      '5. End every answer by connecting your work to business value.'
    ].join('\n');
  }

  return [
    `${intro} Here is a focused way to approach your question.`,
    '',
    '1. Tell me the target company, role, or round if you want a sharper answer.',
    '2. Meanwhile, frame your prep around skills, resume proof, interview stories, and company fit.',
    '3. For any answer, use: situation -> action -> result -> learning.',
    '4. For technical topics, explain the business problem before the tool or formula.',
    '5. For HR answers, keep them honest, specific, and example-backed.',
    '',
    reason === 'missing_openai_key'
      ? 'Admin note: live LLM mode needs OPENAI_API_KEY set in Vercel Environment Variables.'
      : 'Admin note: live LLM mode was attempted but failed, so this is the built-in backup answer.'
  ].join('\n');
}

function fallbackIntro(code, contextLine) {
  return `${code} scoped answer. ${contextLine}`;
}

function extractCompanyName(message, pageContext) {
  if (pageContext?.company) return pageContext.company;

  const known = [
    'Deloitte', 'KPMG', 'EY', 'Accenture', 'Fractal Analytics', 'Mu Sigma', 'Amazon',
    'JP Morgan', 'JPMorgan', 'Kantar', 'Hindustan Unilever', 'HUL', 'Asian Paints',
    'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Capgemini', 'PwC', 'TCS', 'Infosys'
  ];
  const lower = String(message || '').toLowerCase();
  return known.find(name => lower.includes(name.toLowerCase())) || '';
}

function extractRoleName(message, pageContext) {
  if (pageContext?.role) return pageContext.role;

  const lower = String(message || '').toLowerCase();
  const roles = [
    'data analyst', 'business analyst', 'data scientist', 'analytics consultant',
    'consultant', 'management trainee', 'product analyst', 'risk analyst',
    'financial analyst', 'sales manager', 'operations manager'
  ];
  return roles.find(role => lower.includes(role)) || '';
}

function normalizeUserMessage(message) {
  return String(message || '')
    .replace(/\bpythpn\b/gi, 'python')
    .replace(/\bpyhton\b/gi, 'python')
    .replace(/\bpyton\b/gi, 'python')
    .replace(/\bplacemnts?\b/gi, 'placements')
    .replace(/\bintervew\b/gi, 'interview')
    .replace(/\bresum\b/gi, 'resume')
    .trim();
}
