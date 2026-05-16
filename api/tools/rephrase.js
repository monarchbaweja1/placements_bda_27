import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { checkRateLimit } from '../shared/rateLimit.js';

const MAX_TEXT = 6000;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MODE_PROMPTS = {
  professional: 'Rephrase the following text in a clear, professional, and business-appropriate tone. Keep it concise and impactful.',
  academic: 'Rephrase the following text in a formal academic tone suitable for research papers or reports. Use precise language and structured sentences.',
  simplified: 'Rephrase the following text in simple, easy-to-understand language. Use short sentences and avoid jargon so anyone can understand it.',
  creative: 'Rephrase the following text in an engaging, creative, and vivid tone. Make it expressive and memorable while preserving the core meaning.',
  formal: 'Rephrase the following text in a formal, polite, and respectful tone suitable for official communications and letters.'
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const auth = await requireUser(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const rate = checkRateLimit(`rephrase:${auth.user.id}`, { limit: 15, windowMs: 60_000 });
  if (!rate.allowed) {
    return sendJson(res, 429, { ok: false, error: { message: 'Too many requests. Try again shortly.' } });
  }

  const text = String(req.body?.text || '').trim();
  const mode = String(req.body?.mode || 'professional').toLowerCase();

  if (!text) return sendJson(res, 400, { ok: false, error: { message: 'Text is required.' } });
  if (text.length > MAX_TEXT) {
    return sendJson(res, 400, { ok: false, error: { message: `Text must be under ${MAX_TEXT} characters.` } });
  }
  if (!process.env.GEMINI_API_KEY) {
    return sendJson(res, 503, { ok: false, error: { message: 'AI service not configured.' } });
  }

  const instruction = MODE_PROMPTS[mode] || MODE_PROMPTS.professional;
  const prompt = `${instruction}

Return ONLY the rephrased text. Do not add any explanation, prefix, or extra commentary.

ORIGINAL TEXT:
"""
${text}
"""`;

  try {
    const r = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 2048 }
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Gemini request failed.');
    }

    const payload = await r.json();
    const rephrased = (payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!rephrased) throw new Error('AI returned an empty response. Please try again.');

    return sendJson(res, 200, { ok: true, rephrased, mode });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: { message: e.message || 'Rephrase failed.' } });
  }
}
