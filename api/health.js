import { applyCors, methodNotAllowed, sendJson } from './shared/http.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  sendJson(res, 200, {
    ok: true,
    service: 'placement-guide-ai',
    phase: 'foundation',
    timestamp: new Date().toISOString()
  });
}
