import { requireUser } from './auth.js';
import { sendJson } from './http.js';
import { loadUserProgramme } from './programmeGuard.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export async function requireAdmin(req, res) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const userContext = await loadUserProgramme(supabase, auth.user.id);

  if (userContext.role !== 'admin') {
    sendJson(res, 403, {
      ok: false,
      error: {
        code: 'admin_required',
        message: 'Admin access is required for this endpoint.'
      }
    });
    return null;
  }

  return {
    ...auth,
    supabase,
    userContext
  };
}
