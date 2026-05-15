import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../shared/auth.js';
import { applyCors, getBearerToken, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { getSupabaseAuthConfig } from '../shared/supabaseAdmin.js';

function getSupabaseForUser(token) {
  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  if (!supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method === 'GET')  return getHistory(req, res);
  if (req.method === 'POST') return saveScore(req, res);
  return methodNotAllowed(res, ['GET', 'POST']);
}

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

async function getHistory(req, res) {
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
