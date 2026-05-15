import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { getSupabaseAdmin, hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });
    }

    if (!hasSupabaseServiceRole()) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Session service not available.' } });
    }

    const supabase = getSupabaseAdmin();

    // Fetch session with lock via update (race-condition safe)
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

    // Check if user already in session
    const { data: existing } = await supabase
      .from('gd_participants')
      .select('id, left_at')
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id)
      .single();

    if (existing && !existing.left_at) {
      // Already in session — just return the session
      return sendJson(res, 200, { ok: true, session, rejoined: true });
    }

    // Insert or re-activate participant
    if (existing) {
      await supabase
        .from('gd_participants')
        .update({ left_at: null, joined_at: new Date().toISOString(), role: 'participant' })
        .eq('id', existing.id);
    } else {
      await supabase.from('gd_participants').insert({
        session_id: sessionId,
        user_id: auth.user.id,
        role: 'participant'
      });
    }

    // Increment participant count and mark active if first join after creator
    const newCount = session.participant_count + 1;
    const updates = { participant_count: newCount };
    if (session.status === 'waiting' && newCount >= 2) updates.status = 'active';
    if (session.status === 'waiting' && !session.started_at) updates.started_at = new Date().toISOString();

    await supabase.from('gd_sessions').update(updates).eq('id', sessionId);

    logInfo('gd_participant_joined', {
      userId: auth.user.id,
      sessionId,
      participantCount: newCount
    });

    return sendJson(res, 200, { ok: true, session: { ...session, ...updates } });
  } catch (error) {
    logError('gd_join_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'join_failed', message: 'Unable to join session.' } });
  }
}
