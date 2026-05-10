import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { normalizeResumeText } from './resumeScoring.js';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);

export async function extractResumeTextFromUpload({ fileName, mimeType, dataBase64 }) {
  const safeName = String(fileName || 'resume').trim();
  const ext = getExtension(safeName);
  const type = String(mimeType || '').toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    if (ext === '.doc') {
      throw userError('unsupported_legacy_doc', 'Legacy .doc files cannot be parsed reliably. Please upload a PDF or modern Word .docx file.');
    }
    throw userError('unsupported_file_type', 'Please upload a resume as PDF, DOCX, or TXT.');
  }

  const buffer = decodeBase64(dataBase64);
  if (!buffer.length) {
    throw userError('empty_file', 'The uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw userError('file_too_large', 'Upload a resume file under 6 MB.');
  }

  let text = '';
  if (ext === '.pdf' || type === 'application/pdf') {
    text = await extractPdfText(buffer);
  } else if (ext === '.docx' || type.includes('wordprocessingml.document')) {
    text = await extractDocxText(buffer);
  } else if (ext === '.txt' || type.startsWith('text/')) {
    text = buffer.toString('utf8');
  }

  const normalized = normalizeResumeText(text);
  if (normalized.length < 120) {
    throw userError(
      'resume_text_unreadable',
      'Could not extract enough readable text from this file. If it is a scanned PDF, upload a text-based PDF/DOCX or paste the text manually.'
    );
  }

  return {
    text: normalized.slice(0, 80_000),
    fileName: safeName,
    fileType: ext.slice(1),
    characters: normalized.length
  };
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value || '';
}

function decodeBase64(value) {
  const raw = String(value || '');
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
  return Buffer.from(base64, 'base64');
}

function getExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function userError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
