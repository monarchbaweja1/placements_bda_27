import { requireUser } from '../shared/auth.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { checkRateLimit } from '../shared/rateLimit.js';
import { extractResumeTextFromUpload } from '../shared/resumeTextExtraction.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    const rate = checkRateLimit(`resume-extract:${auth.user.id}`, { limit: 12, windowMs: 60_000 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
      return sendJson(res, 429, {
        ok: false,
        error: { code: 'rate_limited', message: 'Too many resume uploads. Please try again shortly.' }
      });
    }

    const result = await extractResumeTextFromUpload({
      fileName: req.body?.fileName,
      mimeType: req.body?.mimeType,
      dataBase64: req.body?.dataBase64
    });

    logInfo('resume_text_extracted', {
      userId: auth.user.id,
      fileType: result.fileType,
      characters: result.characters
    });

    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) logError('resume_text_extract_failed', error);

    return sendJson(res, status, {
      ok: false,
      error: {
        code: error.code || 'resume_text_extract_failed',
        message: error.message || 'Unable to extract resume text from this file.'
      }
    });
  }
}
