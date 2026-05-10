import { requireAdmin } from '../shared/admin.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { logError, logInfo } from '../shared/logger.js';
import { normalizeProgrammeCode } from '../shared/programmeGuard.js';
import { validateDocumentInput } from '../shared/ingestion.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const validation = validateDocumentInput(req.body || {});
    if (!validation.ok) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'invalid_document',
          message: validation.error
        }
      });
    }

    const input = validation.value;
    const programmeCode = normalizeProgrammeCode(input.programme);
    const programme = await getProgrammeByCode(admin.supabase, programmeCode);

    if (!programme) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'invalid_programme',
          message: 'Programme must be one of bda, core, hcm, or bifs.'
        }
      });
    }

    const { data: document, error } = await admin.supabase
      .from('documents')
      .insert({
        programme_id: programme.id,
        title: input.title,
        type: input.type,
        source_url: input.sourceUrl,
        uploaded_by: admin.user.id,
        status: 'pending',
        metadata: {
          ...input.metadata,
          rawContent: input.content
        }
      })
      .select('id, title, type, status')
      .single();

    if (error) throw error;

    logInfo('admin_document_uploaded', {
      documentId: document.id,
      programmeCode,
      type: document.type
    });

    return sendJson(res, 201, {
      ok: true,
      document,
      next: {
        endpoint: '/api/admin/ingest-document',
        body: { documentId: document.id }
      }
    });
  } catch (error) {
    logError('admin_upload_document_failed', error);
    return sendJson(res, 500, {
      ok: false,
      error: {
        code: 'upload_document_failed',
        message: 'Unable to create document record.'
      }
    });
  }
}

async function getProgrammeByCode(supabase, programmeCode) {
  const { data, error } = await supabase
    .from('programmes')
    .select('id, code, name')
    .eq('code', programmeCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}
