import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

const MAX_PARTICIPANTS = 11;
const SESSION_EXPIRY_HOURS = 4;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') return listSessions(req, res);
  if (req.method === 'POST') return createSession(req, res);
  return methodNotAllowed(res, ['GET', 'POST']);
}

async function listSessions(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const programme = normalizeProgrammeCode(req.query?.programme) || 'bda';

    if (!hasSupabaseServiceRole()) {
      return sendJson(res, 200, { ok: true, sessions: [] });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('gd_sessions')
      .select('id, topic, description, programme, status, moderator_id, room_url, max_participants, participant_count, created_at, started_at')
      .eq('programme', programme)
      .neq('status', 'ended')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return sendJson(res, 200, { ok: true, sessions: data || [] });
  } catch (error) {
    logError('gd_list_sessions_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'list_failed', message: 'Unable to load sessions.' } });
  }
}

async function createSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const body = req.body || {};
    const topic = String(body.topic || '').trim().slice(0, 200);
    const description = String(body.description || '').trim().slice(0, 500);
    const programme = normalizeProgrammeCode(body.programme) || 'bda';

    if (!topic) {
      return sendJson(res, 400, { ok: false, error: { code: 'topic_required', message: 'A discussion topic is required.' } });
    }

    if (!hasSupabaseServiceRole()) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Session service not available.' } });
    }

    const supabase = getSupabaseAdmin();

    // Create Daily.co room if API key is available
    let roomUrl = null;
    let roomName = null;
    try {
      const dailyResult = await createDailyRoom({ topic, programme });
      roomUrl = dailyResult?.url || null;
      roomName = dailyResult?.name || null;
    } catch (e) {
      logWarn('gd_daily_room_failed', { message: e?.message || String(e) });
    }

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('gd_sessions')
      .insert({
        topic,
        description: description || null,
        programme,
        status: 'waiting',
        created_by: auth.user.id,
        moderator_id: auth.user.id,
        room_url: roomUrl,
        room_name: roomName,
        max_participants: MAX_PARTICIPANTS,
        participant_count: 1
      })
      .select('*')
      .single();

    if (sessionError) throw sessionError;

    // Add creator as moderator-participant
    await supabase.from('gd_participants').insert({
      session_id: session.id,
      user_id: auth.user.id,
      role: 'moderator'
    });

    logInfo('gd_session_created', {
      userId: auth.user.id,
      sessionId: session.id,
      programme,
      hasVideo: !!roomUrl
    });

    return sendJson(res, 201, { ok: true, session });
  } catch (error) {
    logError('gd_create_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'create_failed', message: 'Unable to create session.' } });
  }
}

async function createDailyRoom({ topic, programme }) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return null;

  const roomName = `gd-${programme}-${Date.now()}`;
  const expiryTs = Math.floor(Date.now() / 1000) + SESSION_EXPIRY_HOURS * 3600;

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        max_participants: MAX_PARTICIPANTS,
        exp: expiryTs,
        enable_chat: true,
        enable_knocking: false,
        start_video_off: false,
        start_audio_off: true
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Daily.co API error: ${errText}`);
  }

  return response.json();
}
