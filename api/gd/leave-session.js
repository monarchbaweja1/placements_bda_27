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
    const endSession = Boolean(req.body?.endSession);

    if (!sessionId) {
      return sendJson(res, 400, { ok: false, error: { code: 'session_id_required', message: 'Session ID is required.' } });
    }

    if (!hasSupabaseServiceRole()) {
      return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Session service not available.' } });
    }

    const supabase = getSupabaseAdmin();

    const { data: session } = await supabase
      .from('gd_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return sendJson(res, 404, { ok: false, error: { code: 'session_not_found', message: 'Session not found.' } });
    }

    // Mark participant as left
    await supabase
      .from('gd_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', auth.user.id)
      .is('left_at', null);

    const newCount = Math.max(0, session.participant_count - 1);

    // If moderator ends session or no one left, end the session
    const isModerator = session.moderator_id === auth.user.id;
    const shouldEnd = endSession || newCount === 0;

    if (shouldEnd && isModerator) {
      await supabase.from('gd_sessions').update({
        status: 'ended',
        participant_count: newCount,
        ended_at: new Date().toISOString()
      }).eq('id', sessionId);
    } else if (newCount === 0) {
      await supabase.from('gd_sessions').update({
        status: 'ended',
        participant_count: 0,
        ended_at: new Date().toISOString()
      }).eq('id', sessionId);
    } else {
      // Just decrement and optionally re-assign moderator
      const updates = { participant_count: newCount };

      if (isModerator) {
        // Pick a random remaining participant as new moderator
        const { data: remaining } = await supabase
          .from('gd_participants')
          .select('user_id')
          .eq('session_id', sessionId)
          .neq('user_id', auth.user.id)
          .is('left_at', null)
          .limit(1)
          .order('joined_at');

        if (remaining?.length > 0) {
          updates.moderator_id = remaining[0].user_id;
          await supabase
            .from('gd_participants')
            .update({ role: 'moderator' })
            .eq('session_id', sessionId)
            .eq('user_id', remaining[0].user_id);
        }
      }

      await supabase.from('gd_sessions').update(updates).eq('id', sessionId);
    }

    logInfo('gd_participant_left', {
      userId: auth.user.id,
      sessionId,
      newCount,
      ended: shouldEnd || newCount === 0
    });

    return sendJson(res, 200, { ok: true, ended: shouldEnd || newCount === 0 });
  } catch (error) {
    logError('gd_leave_session_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'leave_failed', message: 'Unable to leave session.' } });
  }
}
