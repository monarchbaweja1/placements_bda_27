import { embedText } from './rag.js';

const MAX_CHUNK_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 220;
const MAX_INGEST_CHARS = 250_000;

export const ALLOWED_DOCUMENT_TYPES = new Set([
  'placement_report',
  'resume',
  'interview_experience',
  'company_document',
  'roadmap',
  'prep_material',
  'shortlist_data',
  'role_data'
]);

export function cleanText(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_INGEST_CHARS);
}

export function chunkText(text, options = {}) {
  const maxChars = options.maxChars || MAX_CHUNK_CHARS;
  const overlap = Math.min(options.overlap || CHUNK_OVERLAP_CHARS, Math.floor(maxChars / 3));
  const cleaned = cleanText(text);
  const paragraphs = cleaned.split(/\n{2,}/).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).trim().length <= maxChars) {
      current = (current ? current + '\n\n' : '') + paragraph;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += maxChars - overlap) {
      chunks.push(paragraph.slice(start, start + maxChars));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return withOverlap(chunks, overlap);
}

export async function embedChunks(chunks) {
  const embedded = [];

  for (const [index, content] of chunks.entries()) {
    const embedding = await embedText(content);
    embedded.push({
      chunk_index: index,
      content,
      embedding
    });
  }

  return embedded;
}

export function validateDocumentInput(body) {
  const title = String(body.title || '').trim();
  const programme = String(body.programme || '').trim();
  const type = String(body.type || '').trim();
  const content = cleanText(body.content);

  if (!title) return { ok: false, error: 'Document title is required.' };
  if (!programme) return { ok: false, error: 'Programme is required.' };
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) return { ok: false, error: 'Invalid document type.' };
  if (!content || content.length < 50) return { ok: false, error: 'Document content must contain at least 50 characters.' };

  return {
    ok: true,
    value: {
      title,
      programme,
      type,
      content,
      metadata: normalizeMetadata(body.metadata),
      sourceUrl: String(body.sourceUrl || '').trim() || null
    }
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return JSON.parse(JSON.stringify(metadata));
}

function withOverlap(chunks, overlap) {
  return chunks.map((chunk, index) => {
    if (index === 0 || overlap <= 0) return chunk.trim();
    const previousTail = chunks[index - 1].slice(-overlap);
    return `${previousTail}\n\n${chunk}`.trim();
  });
}
