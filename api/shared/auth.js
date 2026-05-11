import { getBearerToken } from './http.js';
import { getSupabaseAuthConfig } from './supabaseAdmin.js';

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

  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  const data = response.ok ? await response.json() : null;

  if (!response.ok || !data?.id) {
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
    user: data,
    token
  };
}
