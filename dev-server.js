import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 10 * 1024 * 1024;

await loadEnvFile('.env.local');
await loadEnvFile('.env');
process.env.GIM_LOCAL_DEV = process.env.GIM_LOCAL_DEV || '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://dsrwktqgpngrviavceal.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_bLUTa913DWCoVFTt9r_vew_Wa_hjEbV';
if (process.env.AI_ALLOWED_ORIGIN === undefined) {
  process.env.AI_ALLOWED_ORIGIN = 'null';
}

const apiRoutes = new Map([
  ['/api/health', 'api/health.js'],
  ['/api/ai/context-test', 'api/ai/context-test.js'],
  ['/api/ai/status', 'api/ai/status.js'],
  ['/api/ai/chat', 'api/ai/chat.js'],
  ['/api/ai/extract-resume', 'api/ai/extract-resume.js'],
  ['/api/ai/resume-analyze', 'api/ai/resume-analyze.js'],
  ['/api/ai/shortlist-probability', 'api/ai/shortlist-probability.js'],
  ['/api/admin/upload-document', 'api/admin/upload-document.js'],
  ['/api/admin/ingest-document', 'api/admin/ingest-document.js']
]);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (apiRoutes.has(url.pathname)) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, {
      ok: false,
      error: { code: 'dev_server_error', message: 'Local dev server error.' }
    });
  }
}).listen(PORT, () => {
  console.log(`GIM Placement Prep Hub running at http://localhost:${PORT}`);
});

async function handleApi(req, nodeRes, routePath) {
  const body = await readBody(req);
  const reqForHandler = Object.assign(req, { body });
  const resForHandler = createResponseShim(nodeRes);
  const modulePath = path.join(__dirname, apiRoutes.get(routePath));
  const mod = await import(pathToFileURL(modulePath).href);
  await mod.default(reqForHandler, resForHandler);
}

async function serveStatic(urlPath, res) {
  const safePath = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  const normalized = path.normalize(safePath);

  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    sendText(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  let filePath = path.join(__dirname, normalized);
  if (existsSync(filePath) && path.extname(filePath) === '') {
    filePath = path.join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) filePath = path.join(__dirname, 'index.html');

  const content = await readFile(filePath);
  sendText(res, 200, content, getContentType(filePath));
}

function createResponseShim(res) {
  return {
    setHeader: (name, value) => res.setHeader(name, value),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      sendJson(res, res.statusCode || 200, payload);
    },
    end(payload = '') {
      res.end(payload);
    }
  };
}

async function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method || '')) return undefined;

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  if ((req.headers['content-type'] || '').includes('application/json')) {
    return JSON.parse(text);
  }
  return text;
}

function sendJson(res, statusCode, payload) {
  if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, content, contentType) {
  if (!res.headersSent) res.setHeader('Content-Type', contentType);
  res.statusCode = statusCode;
  res.end(content);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf'
  }[ext] || 'application/octet-stream';
}

async function loadEnvFile(fileName) {
  const filePath = path.join(__dirname, fileName);
  if (!existsSync(filePath)) return;

  const content = await readFile(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
