import { getBearerToken } from './http.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export async function requireUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: {
        code: 'missing_auth',
        message: 'Missing Supabase bearer token.'
      }
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      error: {
        code: 'invalid_auth',
        message: 'Invalid or expired Supabase session.'
      }
    };
  }

  return {
    ok: true,
    user: data.user,
    token
  };
}
