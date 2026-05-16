import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../shared/auth.js';
import { applyCors, getBearerToken, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { getSupabaseAuthConfig } from '../shared/supabaseAdmin.js';

const MAX_PARTICIPANTS = 11;

function getSupabaseForUser(token) {
  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  if (!supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

function getSupabaseAnon() {
  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  if (!supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === 'GET') {
    if (req.query?.type === 'participants') return listParticipants(req, res);
    if (req.query?.type === 'scores')       return getScoreHistory(req, res);
    if (req.query?.type === 'mine')         return listMySessions(req, res);
    return listSessions(req, res);
  }
  if (req.method === 'POST') {
    const action = req.body?.action;
    if (action === 'book')       return bookSession(req, res);
    if (action === 'join')       return bookSession(req, res); // alias
    if (action === 'leave')      return leaveSession(req, res);
    if (action === 'delete')     return deleteSession(req, res);
    if (action === 'update')     return updateSession(req, res);
    if (action === 'save-score') return saveScore(req, res);
    return createSession(req, res);
  }
  return methodNotAllowed(res, ['GET', 'POST']);
}

// ── LIST SESSIONS — use token if present, anon fallback ─────
async function listSessions(req, res) {
  try {
    const programme = normalizeProgrammeCode(req.query?.programme) || 'bda';
    const token = getBearerToken(req);
    const supabase = token ? getSupabaseForUser(token) : getSupabaseAnon();
    if (!supabase) return sendJson(res, 200, { ok: true, sessions: [] });

    const { data, error } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('programme', programme)
      .neq('status', 'ended')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(20);

    if (error) throw error;
    return sendJson(res, 200, { ok: true, sessions: data || [] });
  } catch (error) {
    logError('gd_list_sessions_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'list_failed', message: 'Unable to load sessions.' } });
  }
}

// ── LIST PARTICIPANTS — use token if present, anon fallback ──
async function listParticipants(req, res) {
  try {
    const sessionId = String(req.query?.sessionId || '').trim();
    if (!sessionId) return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID required.' } });

    const token = getBearerToken(req);
    const supabase = token ? getSupabaseForUser(token) : getSupabaseAnon();
    if (!supabase) return sendJson(res, 200, { ok: true, participants: [] });

    const { data, error } = await supabase
      .from('gd_participants')
      .select('id, participant_name, participant_roll, participant_programme, role, joined_at')
      .eq('session_id', sessionId)
      .is('left_at', null)
      .order('joined_at');

    if (error) throw error;
    return sendJson(res, 200, { ok: true, participants: data || [] });
  } catch (error) {
    logError('gd_list_participants_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'list_failed', message: 'Unable to load participants.' } });
  }
}

// ── CREATE ──────────────────────────────────────────────────
async function createSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const body         = req.body || {};
    const topic        = String(body.topic        || '').trim().slice(0, 200);
    const description  = String(body.description  || '').trim().slice(0, 500);
    const creatorName  = String(body.creatorName  || '').trim().slice(0, 100);
    const programme    = normalizeProgrammeCode(body.programme) || 'bda';
    const slotNumber   = Math.min(10, Math.max(1, parseInt(body.slotNumber) || 1));
    const scheduledAt  = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;

    if (!creatorName) return sendJson(res, 400, { ok: false, error: { code: 'name_required', message: 'Please enter your name.' } });
    if (!topic)       return sendJson(res, 400, { ok: false, error: { code: 'topic_required', message: 'A discussion topic is required.' } });
    if (!scheduledAt) return sendJson(res, 400, { ok: false, error: { code: 'scheduled_required', message: 'Please select a date and time for the session.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    // Jitsi Meet — free, no API key required
    const roomId   = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const roomName = `BDA27-GD-SLOT${slotNumber}-${programme.toUpperCase()}-${roomId}`;
    const roomUrl  = `https://meet.jit.si/${roomName}`; // hash config applied client-side

    const { data: session, error: sessionError } = await supabase
      .from('gd_sessions')
      .insert({
        topic,
        description:      description || null,
        creator_name:     creatorName,
        programme,
        slot_number:      slotNumber,
        scheduled_at:     scheduledAt,
        status:           'waiting',
        created_by:       auth.user.id,
        room_url:         roomUrl,
        room_name:        roomName,
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

// ── BOOK (register for a session) ───────────────────────────
async function bookSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const body            = req.body || {};
    const sessionId       = String(body.sessionId       || '').trim();
    const participantName = String(body.participantName || '').trim().slice(0, 100);
    const participantRoll = String(body.participantRoll || '').trim().slice(0, 50);
    const participantProg = String(body.participantProgramme || '').trim().slice(0, 20);

    if (!sessionId)       return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });
    if (!participantName) return sendJson(res, 400, { ok: false, error: { code: 'name_required', message: 'Your name is required.' } });
    if (!participantRoll) return sendJson(res, 400, { ok: false, error: { code: 'roll_required', message: 'Roll number is required.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const { data: session, error: fetchError } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('id', sessionId)
      .neq('status', 'ended')
      .single();

    if (fetchError || !session) return sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found or has ended.' } });
    if (session.participant_count >= session.max_participants) return sendJson(res, 409, { ok: false, error: { code: 'session_full', message: 'This session is full (11/11).' } });

    // Check if already booked
    const { data: existing } = await supabase
      .from('gd_participants')
      .select('id, left_at')
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id)
      .single();

    if (existing && !existing.left_at) return sendJson(res, 200, { ok: true, alreadyBooked: true });

    if (existing) {
      await supabase.from('gd_participants')
        .update({ left_at: null, joined_at: new Date().toISOString(), role: 'participant', participant_name: participantName, participant_roll: participantRoll, participant_programme: participantProg || null })
        .eq('id', existing.id);
    } else {
      await supabase.from('gd_participants').insert({
        session_id: sessionId, user_id: auth.user.id, role: 'participant',
        participant_name: participantName,
        participant_roll: participantRoll,
        participant_programme: participantProg || null
      });
    }

    const newCount = session.participant_count + 1;
    await supabase.from('gd_sessions').update({ participant_count: newCount }).eq('id', sessionId);

    logInfo('gd_participant_booked', { userId: auth.user.id, sessionId, count: newCount });
    return sendJson(res, 200, { ok: true, newCount });
  } catch (error) {
    logError('gd_book_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'book_failed', message: 'Unable to book session. Please try again.' } });
  }
}

// ── DELETE — creator only ────────────────────────────────────
async function deleteSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID required.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const { data: session } = await supabase
      .from('gd_sessions')
      .select('created_by')
      .eq('id', sessionId)
      .single();

    if (!session) return sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Session not found.' } });
    if (session.created_by !== auth.user.id) return sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'Only the creator can delete this session.' } });

    const { error } = await supabase.from('gd_sessions').delete().eq('id', sessionId);
    if (error) throw error;

    logInfo('gd_session_deleted', { userId: auth.user.id, sessionId });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    logError('gd_delete_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'delete_failed', message: 'Unable to delete session.' } });
  }
}

// ── SAVE SCORE ────────────────────────────────────────────────
async function saveScore(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const body      = req.body || {};
    const programme = normalizeProgrammeCode(body.programme) || 'bda';
    const token     = getBearerToken(req);
    const supabase  = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured' } });

    const fin = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

    const { data, error } = await supabase.from('gd_session_scores').insert({
      user_id:             auth.user.id,
      session_id:          body.sessionId          || null,
      programme,
      confidence_score:    fin(body.confidenceScore),
      wpm:                 fin(body.wpm),
      participation_pct:   fin(body.participationPct),
      speaking_turns:      fin(body.speakingTurns),
      vocabulary_richness: fin(body.vocabularyRichness),
      interruptions:       fin(body.interruptions) ?? 0,
      elapsed_ms:          fin(body.elapsedMs),
    }).select('id').single();

    if (error) throw error;
    return sendJson(res, 201, { ok: true, id: data.id });
  } catch (error) {
    logError('gd_save_score_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'save_failed', message: 'Could not save score.' } });
  }
}

// ── GET SCORE HISTORY ─────────────────────────────────────────
async function getScoreHistory(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const token    = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 200, { ok: true, scores: [] });

    const { data, error } = await supabase
      .from('gd_session_scores')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return sendJson(res, 200, { ok: true, scores: data || [] });
  } catch (error) {
    logError('gd_get_history_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'history_failed', message: 'Could not load history.' } });
  }
}

// ── LIST MY SESSIONS — creator's own sessions ─────────────────
async function listMySessions(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 200, { ok: true, sessions: [] });

    const { data, error } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('created_by', auth.user.id)
      .neq('status', 'ended')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(30);

    if (error) throw error;
    return sendJson(res, 200, { ok: true, sessions: data || [] });
  } catch (error) {
    logError('gd_list_mine_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'list_failed', message: 'Unable to load your sessions.' } });
  }
}

// ── UPDATE — creator only ─────────────────────────────────────
async function updateSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const body        = req.body || {};
    const sessionId   = String(body.sessionId  || '').trim();
    const topic       = String(body.topic       || '').trim().slice(0, 200);
    const description = String(body.description || '').trim().slice(0, 500);
    const slotNumber  = Math.min(10, Math.max(1, parseInt(body.slotNumber) || 1));
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;

    if (!sessionId)   return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID required.' } });
    if (!topic)       return sendJson(res, 400, { ok: false, error: { code: 'topic_required', message: 'Topic is required.' } });
    if (!scheduledAt) return sendJson(res, 400, { ok: false, error: { code: 'scheduled_required', message: 'Date and time are required.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const { data: session } = await supabase.from('gd_sessions').select('created_by').eq('id', sessionId).single();
    if (!session) return sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Session not found.' } });
    if (session.created_by !== auth.user.id) return sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'Only the creator can edit this session.' } });

    const { error } = await supabase.from('gd_sessions')
      .update({ topic, description: description || null, slot_number: slotNumber, scheduled_at: scheduledAt })
      .eq('id', sessionId);

    if (error) throw error;
    logInfo('gd_session_updated', { userId: auth.user.id, sessionId });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    logError('gd_update_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'update_failed', message: 'Unable to update session. Please try again.' } });
  }
}

// ── LEAVE ─────────────────────────────────────────────────────
async function leaveSession(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const sessionId  = String(req.body?.sessionId || '').trim();
    const endSession = Boolean(req.body?.endSession);
    if (!sessionId) return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });

    const token = getBearerToken(req);
    const supabase = getSupabaseForUser(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const { data: session } = await supabase.from('gd_sessions').select('*').eq('id', sessionId).single();
    if (!session) return sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found.' } });

    await supabase.from('gd_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', sessionId).eq('user_id', auth.user.id).is('left_at', null);

    const newCount  = Math.max(0, session.participant_count - 1);
    const shouldEnd = endSession || newCount === 0;

    if (shouldEnd) {
      await supabase.from('gd_sessions').update({ status: 'ended', participant_count: newCount, ended_at: new Date().toISOString() }).eq('id', sessionId);
    } else {
      await supabase.from('gd_sessions').update({ participant_count: newCount }).eq('id', sessionId);
    }

    logInfo('gd_participant_left', { userId: auth.user.id, sessionId, newCount, ended: shouldEnd });
    return sendJson(res, 200, { ok: true, ended: shouldEnd });
  } catch (error) {
    logError('gd_leave_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'leave_failed', message: 'Unable to leave session.' } });
  }
}
