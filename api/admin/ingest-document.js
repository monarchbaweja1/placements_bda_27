import { requireAdmin } from '../shared/admin.js';
import { applyCors, methodNotAllowed, sendJson } from '../shared/http.js';
import { chunkText, embedChunks } from '../shared/ingestion.js';
import { logError, logInfo } from '../shared/logger.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  let supabaseForFailure = null;
  let documentIdForFailure = null;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    supabaseForFailure = admin.supabase;

    const documentId = String(req.body?.documentId || '').trim();
    documentIdForFailure = documentId;
    if (!documentId) {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'document_id_required',
          message: 'documentId is required.'
        }
      });
    }

    const document = await loadDocument(admin.supabase, documentId);
    if (!document) {
      return sendJson(res, 404, {
        ok: false,
        error: {
          code: 'document_not_found',
          message: 'Document was not found.'
        }
      });
    }

    const rawContent = document.metadata?.rawContent;
    if (!rawContent) {
      return sendJson(res, 422, {
        ok: false,
        error: {
          code: 'document_content_missing',
          message: 'Document has no rawContent metadata to ingest.'
        }
      });
    }

    await updateDocumentStatus(admin.supabase, documentId, 'processing');
    await admin.supabase.from('document_chunks').delete().eq('document_id', documentId);

    const chunks = chunkText(rawContent);
    const embeddedChunks = await embedChunks(chunks);
    const rows = embeddedChunks.map(chunk => ({
      document_id: document.id,
      programme_id: document.programme_id,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: {
        sourceTitle: document.title,
        sourceType: document.type,
        ...stripRawContent(document.metadata)
      }
    }));

    const { error: insertError } = await admin.supabase
      .from('document_chunks')
      .insert(rows);

    if (insertError) throw insertError;

    await admin.supabase
      .from('documents')
      .update({
        status: 'ready',
        metadata: {
          ...stripRawContent(document.metadata),
          ingestion: {
            chunkCount: rows.length,
            ingestedAt: new Date().toISOString()
          }
        }
      })
      .eq('id', documentId);

    logInfo('admin_document_ingested', {
      documentId,
      chunkCount: rows.length
    });

    return sendJson(res, 200, {
      ok: true,
      documentId,
      chunks: rows.length,
      status: 'ready'
    });
  } catch (error) {
    logError('admin_ingest_document_failed', error);

    if (supabaseForFailure && documentIdForFailure) {
      try {
        await updateDocumentStatus(supabaseForFailure, documentIdForFailure, 'failed');
      } catch {
        // Preserve the original error response.
      }
    }

    return sendJson(res, 500, {
      ok: false,
      error: {
        code: 'ingest_document_failed',
        message: 'Unable to ingest document.'
      }
    });
  }
}

async function loadDocument(supabase, documentId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, programme_id, title, type, metadata')
    .eq('id', documentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateDocumentStatus(supabase, documentId, status) {
  if (!supabase) return;
  const { error } = await supabase
    .from('documents')
    .update({ status })
    .eq('id', documentId);

  if (error) throw error;
}

function stripRawContent(metadata = {}) {
  const { rawContent, ...rest } = metadata;
  return rest;
}
