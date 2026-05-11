import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { getAiModels } from '../shared/openai.js';
import { hasSupabaseServiceRole } from '../shared/supabaseAdmin.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const auth = await requireUser(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const { chatModel, embeddingModel } = getAiModels();

  return sendJson(res, 200, {
    ok: true,
    ai: {
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      chatModel,
      embeddingModel
    },
    supabase: {
      serviceRoleConfigured: hasSupabaseServiceRole()
    }
  });
}
