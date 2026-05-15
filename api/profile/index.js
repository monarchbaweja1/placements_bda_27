import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../shared/auth.js';
import { applyCors, getBearerToken, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { getSupabaseAuthConfig } from '../shared/supabaseAdmin.js';

function getSupabase(token) {
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
  if (req.method === 'GET') return getProfile(req, res);
  if (req.method === 'POST') return postProfile(req, res);
  return methodNotAllowed(res, ['GET', 'POST']);
}

// ── GET ─────────────────────────────────────────────────────
async function getProfile(req, res) {
  try {
    const type = req.query?.type;

    // Class placement board — public read, no auth required
    if (type === 'board') {
      const supabase = getSupabaseAnon();
      if (!supabase) return sendJson(res, 200, { ok: true, board: [] });

      const { data: placed } = await supabase
        .from('placements')
        .select('id, offer_company, offer_role, ctc, joining_date, updated_at')
        .eq('status', 'placed')
        .order('ctc', { ascending: false });

      if (!placed?.length) return sendJson(res, 200, { ok: true, board: [] });

      const ids = placed.map(p => p.id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, roll_no')
        .in('id', ids);

      const profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
      const board = placed.map(p => ({
        name:         profMap[p.id]?.name    || 'Anonymous',
        rollNo:       profMap[p.id]?.roll_no || '',
        offerCompany: p.offer_company,
        offerRole:    p.offer_role,
        ctc:          p.ctc,
        joiningDate:  p.joining_date,
        updatedAt:    p.updated_at
      }));

      return sendJson(res, 200, { ok: true, board });
    }

    // Own profile — auth required
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const token = getBearerToken(req);
    const supabase = getSupabase(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const [{ data: profile }, { data: placement }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', auth.user.id).single(),
      supabase.from('placements').select('*').eq('id', auth.user.id).single()
    ]);

    return sendJson(res, 200, { ok: true, profile: profile || null, placement: placement || null });
  } catch (error) {
    logError('profile_get_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'get_failed', message: 'Unable to load profile.' } });
  }
}

// ── POST ────────────────────────────────────────────────────
async function postProfile(req, res) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const token = getBearerToken(req);
    const supabase = getSupabase(token);
    if (!supabase) return sendJson(res, 503, { ok: false, error: { code: 'db_not_configured', message: 'Database not configured.' } });

    const { action } = req.body || {};

    if (action === 'save-profile') return saveProfile({ req, res, auth, supabase });
    if (action === 'save-placement') return savePlacement({ req, res, auth, supabase });
    if (action === 'add-interview') return addInterview({ req, res, auth, supabase });
    if (action === 'remove-interview') return removeInterview({ req, res, auth, supabase });

    return sendJson(res, 400, { ok: false, error: { code: 'unknown_action', message: 'Unknown action.' } });
  } catch (error) {
    logError('profile_post_failed', { message: error?.message || String(error) });
    return sendJson(res, 500, { ok: false, error: { code: 'save_failed', message: 'Unable to save. Please try again.' } });
  }
}

async function saveProfile({ req, res, auth, supabase }) {
  const b = req.body || {};
  const name       = String(b.name       || '').trim().slice(0, 100);
  const rollNo     = String(b.rollNo     || '').trim().slice(0, 30);
  const email      = String(b.email      || '').trim().slice(0, 200);
  const internship = String(b.internship || '').trim().slice(0, 200);
  const resumeLink = String(b.resumeLink || '').trim().slice(0, 500);
  const targetRoles     = Array.isArray(b.targetRoles)     ? b.targetRoles.slice(0, 10).map(r => String(r).trim())     : [];
  const targetCompanies = Array.isArray(b.targetCompanies) ? b.targetCompanies.slice(0, 15).map(c => String(c).trim()) : [];

  const { data, error } = await supabase.from('profiles').upsert({
    id: auth.user.id,
    name, roll_no: rollNo, email,
    internship, resume_link: resumeLink,
    target_roles: targetRoles,
    target_companies: targetCompanies,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' }).select().single();

  if (error) throw error;
  logInfo('profile_saved', { userId: auth.user.id });
  return sendJson(res, 200, { ok: true, profile: data });
}

async function savePlacement({ req, res, auth, supabase }) {
  const b = req.body || {};
  const status       = ['searching', 'interviewing', 'placed', 'declined'].includes(b.status) ? b.status : 'searching';
  const offerCompany = String(b.offerCompany || '').trim().slice(0, 200);
  const offerRole    = String(b.offerRole    || '').trim().slice(0, 200);
  const ctc          = b.ctc ? Number(b.ctc) : null;
  const joiningDate  = b.joiningDate ? String(b.joiningDate).slice(0, 10) : null;

  const { data, error } = await supabase.from('placements').upsert({
    id: auth.user.id,
    status,
    offer_company: offerCompany || null,
    offer_role:    offerRole    || null,
    ctc:           ctc,
    joining_date:  joiningDate  || null,
    updated_at:    new Date().toISOString()
  }, { onConflict: 'id' }).select().single();

  if (error) throw error;
  logInfo('placement_saved', { userId: auth.user.id, status });
  return sendJson(res, 200, { ok: true, placement: data });
}

async function addInterview({ req, res, auth, supabase }) {
  const b = req.body || {};
  const company = String(b.company || '').trim().slice(0, 100);
  const role    = String(b.role    || '').trim().slice(0, 100);
  const round   = String(b.round   || '').trim().slice(0, 100);
  const date    = String(b.date    || '').slice(0, 10);
  const result  = ['selected', 'rejected', 'pending'].includes(b.result) ? b.result : 'pending';

  if (!company) return sendJson(res, 400, { ok: false, error: { code: 'company_required', message: 'Company name is required.' } });

  // Fetch current interviews
  const { data: current } = await supabase.from('placements').select('interviews').eq('id', auth.user.id).single();
  const existing = Array.isArray(current?.interviews) ? current.interviews : [];
  const newEntry = { id: crypto.randomUUID(), company, role, round, date, result, addedAt: new Date().toISOString() };
  const updated = [...existing, newEntry].slice(-30); // max 30 entries

  const { data, error } = await supabase.from('placements').upsert({
    id: auth.user.id,
    interviews: updated,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' }).select().single();

  if (error) throw error;
  return sendJson(res, 200, { ok: true, placement: data });
}

async function removeInterview({ req, res, auth, supabase }) {
  const interviewId = String(req.body?.interviewId || '').trim();
  if (!interviewId) return sendJson(res, 400, { ok: false, error: { code: 'id_required', message: 'Interview ID required.' } });

  const { data: current } = await supabase.from('placements').select('interviews').eq('id', auth.user.id).single();
  const filtered = (Array.isArray(current?.interviews) ? current.interviews : []).filter(i => i.id !== interviewId);

  const { data, error } = await supabase.from('placements').upsert({
    id: auth.user.id, interviews: filtered, updated_at: new Date().toISOString()
  }, { onConflict: 'id' }).select().single();

  if (error) throw error;
  return sendJson(res, 200, { ok: true, placement: data });
}
