import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../shared/auth.js';
import { applyCors, getBearerToken, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { getSupabaseAuthConfig } from '../shared/supabaseAdmin.js';

const MAX_PARTICIPANTS = 11;

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
    if (!supabase) return sendJson(res, 200, { ok: true, sessions: [] });

    const { data, error } = await supabase
      .from('gd_sessions')
      .select('id, topic, description, programme, status, slot_number, scheduled_at, moderator_id, created_by, room_url, room_name, max_participants, participant_count, created_at, started_at')
      .eq('programme', programme)
      .neq('status', 'ended')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(20);

    if (error) throw error;

    // Fetch creator names from profiles
    const creatorIds = [...new Set((data || []).map(s => s.created_by).filter(Boolean))];
    let creatorMap = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, roll_no')
        .in('id', creatorIds);
      creatorMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    }

    const sessions = (data || []).map(s => ({
      ...s,
      creatorName: creatorMap[s.created_by]?.name || null,
      creatorRoll: creatorMap[s.created_by]?.roll_no || null
    }));

    return sendJson(res, 200, { ok: true, sessions });
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

    const body        = req.body || {};
    const topic       = String(body.topic       || '').trim().slice(0, 200);
    const description = String(body.description || '').trim().slice(0, 500);
    const programme   = normalizeProgrammeCode(body.programme) || 'bda';
    const slotNumber  = Math.min(10, Math.max(1, parseInt(body.slotNumber) || 1));
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;

    if (!topic) return sendJson(res, 400, { ok: false, error: { code: 'topic_required', message: 'A discussion topic is required.' } });
    if (!scheduledAt) return sendJson(res, 400, { ok: false, error: { code: 'scheduled_required', message: 'Please select a date and time for the session.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    // Jitsi Meet — completely free, no API key required; rooms are auto-created on first join
    const roomId   = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const roomName = `BDA27-GD-SLOT${slotNumber}-${programme.toUpperCase()}-${roomId}`;
    const roomUrl  = `https://meet.jit.si/${roomName}`;

    const { data: session, error: sessionError } = await supabase
      .from('gd_sessions')
      .insert({
        topic,
        description:   description || null,
        programme,
        slot_number:   slotNumber,
        scheduled_at:  scheduledAt,
        status:        'waiting',
        created_by:    auth.user.id,
        moderator_id:  auth.user.id,
        room_url:      roomUrl,
        room_name:     roomName,
        max_participants: MAX_PARTICIPANTS,
        participant_count: 0
      })
      .select('*')
      .single();

    if (sessionError) throw sessionError;

    logInfo('gd_session_created', { userId: auth.user.id, sessionId: session.id, programme, slotNumber });
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

    const isCreator = auth.user.id === session.created_by;
    const role = isCreator ? 'moderator' : 'participant';

    if (existing) {
      await supabase.from('gd_participants')
        .update({ left_at: null, joined_at: new Date().toISOString(), role })
        .eq('id', existing.id);
    } else {
      await supabase.from('gd_participants').insert({
        session_id: sessionId,
        user_id: auth.user.id,
        role
      });
    }

    const newCount = session.participant_count + 1;
    const updates  = { participant_count: newCount };
    if (session.status === 'waiting') {
      updates.status     = 'active';
      updates.started_at = new Date().toISOString();
    }
    await supabase.from('gd_sessions').update(updates).eq('id', sessionId);

    logInfo('gd_participant_joined', { userId: auth.user.id, sessionId, count: newCount });
    return sendJson(res, 200, { ok: true, session: { ...session, ...updates, isCreator } });
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

