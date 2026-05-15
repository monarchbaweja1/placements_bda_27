import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../shared/auth.js';
import { applyCors, getBearerToken, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo, logWarn } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { getSupabaseAuthConfig } from '../shared/supabaseAdmin.js';

const MAX_PARTICIPANTS = 11;
const SESSION_EXPIRY_HOURS = 4;

// Uses the user's own auth token — works with SUPABASE_URL + SUPABASE_ANON_KEY
// (no service role key required), and respects RLS policies properly.
function getSupabaseForUser(token) {
  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  if (!supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') return listSessions(req, res);
  if (req.method === 'POST') {
    const action = req.body?.action;
    if (action === 'join')  return joinSession(req, res);
    if (action === 'leave') return leaveSession(req, res);
    return createSession(req, res);
  }
  return methodNotAllowed(res, ['GET', 'POST']);
}

// ── LIST ────────────────────────────────────────────────────
async function listSessions(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const programme = normalizeProgrammeCode(req.query?.programme) || 'bda';
    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);

    if (!supabase) {
      return sendJson(res, 200, { ok: true, sessions: [] });
    }

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

// ── CREATE ──────────────────────────────────────────────────
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

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured. Please contact the admin.' } });
    }

    let roomUrl = null, roomName = null;
    try {
      const room = await createDailyRoom({ programme });
      roomUrl = room?.url || null;
      roomName = room?.name || null;
    } catch (e) {
      logWarn('gd_daily_room_failed', { message: e?.message || String(e) });
    }

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

    // Add creator as moderator participant
    await supabase.from('gd_participants').insert({
      session_id: session.id,
      user_id: auth.user.id,
      role: 'moderator'
    });

    logInfo('gd_session_created', { userId: auth.user.id, sessionId: session.id, programme, hasVideo: !!roomUrl });
    return sendJson(res, 201, { ok: true, session });
  } catch (error) {
    logError('gd_create_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'create_failed', message: 'Unable to create session. Please try again.' } });
  }
}

// ── JOIN ─────────────────────────────────────────────────────
async function joinSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });
    }

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });
    }

    const { data: session, error: fetchError } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('id', sessionId)
      .neq('status', 'ended')
      .single();

    if (fetchError || !session) {
      return sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found or has ended.' } });
    }
    if (session.participant_count >= session.max_participants) {
      return sendJson(res, 409, { ok: false, error: { code: 'session_full', message: 'This session is full (11/11 participants).' } });
    }

    const { data: existing } = await supabase
      .from('gd_participants')
      .select('id, left_at')
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id)
      .single();

    if (existing && !existing.left_at) {
      return sendJson(res, 200, { ok: true, session, rejoined: true });
    }

    if (existing) {
      // Re-activate: user can update their own participant record
      await supabase.from('gd_participants')
        .update({ left_at: null, joined_at: new Date().toISOString(), role: 'participant' })
        .eq('id', existing.id);
    } else {
      await supabase.from('gd_participants').insert({
        session_id: sessionId,
        user_id: auth.user.id,
        role: 'participant'
      });
    }

    const newCount = session.participant_count + 1;
    const updates = { participant_count: newCount };
    if (session.status === 'waiting' && newCount >= 2) updates.status = 'active';
    if (!session.started_at) updates.started_at = new Date().toISOString();

    await supabase.from('gd_sessions').update(updates).eq('id', sessionId);

    logInfo('gd_participant_joined', { userId: auth.user.id, sessionId, participantCount: newCount });
    return sendJson(res, 200, { ok: true, session: { ...session, ...updates } });
  } catch (error) {
    logError('gd_join_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'join_failed', message: 'Unable to join session.' } });
  }
}

// ── LEAVE ─────────────────────────────────────────────────────
async function leaveSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const sessionId = String(req.body?.sessionId || '').trim();
    const endSession = Boolean(req.body?.endSession);

    if (!sessionId) {
      return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });
    }

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });
    }

    const { data: session } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found.' } });
    }

    // Mark own participant record as left
    await supabase.from('gd_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id)
      .is('left_at', null);

    const newCount = Math.max(0, session.participant_count - 1);
    const isModerator = session.moderator_id === auth.user.id;
    const shouldEnd = endSession || newCount === 0;

    if (shouldEnd) {
      await supabase.from('gd_sessions').update({
        status: 'ended',
        participant_count: newCount,
        ended_at: new Date().toISOString()
      }).eq('id', sessionId);
    } else {
      const updates = { participant_count: newCount };

      if (isModerator) {
        // Pick next participant as moderator — update session.moderator_id only
        // (cannot update other users' gd_participants rows with user token + RLS)
        const { data: remaining } = await supabase
          .from('gd_participants')
          .select('user_id')
          .eq('session_id', sessionId)
          .neq('user_id', auth.user.id)
          .is('left_at', null)
          .order('joined_at')
          .limit(1);

        if (remaining?.length > 0) {
          updates.moderator_id = remaining[0].user_id;
        }
      }

      await supabase.from('gd_sessions').update(updates).eq('id', sessionId);
    }

    logInfo('gd_participant_left', { userId: auth.user.id, sessionId, newCount, ended: shouldEnd });
    return sendJson(res, 200, { ok: true, ended: shouldEnd });
  } catch (error) {
    logError('gd_leave_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'leave_failed', message: 'Unable to leave session.' } });
  }
}

// ── DAILY.CO ROOM ────────────────────────────────────────────
async function createDailyRoom({ programme }) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return null;

  const expiryTs = Math.floor(Date.now() / 1000) + SESSION_EXPIRY_HOURS * 3600;
  const roomName = `gd-${programme}-${Date.now()}`;

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        max_participants: MAX_PARTICIPANTS,
        exp: expiryTs,
        enable_chat: true,
        enable_knocking: false,
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
