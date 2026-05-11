# AI Foundation - Phase 0

This phase adds backend scaffolding only. It intentionally does not change the existing `index.html` UI, auth flow, programme selector, ticker, content sections, animations, or deployed frontend behavior.

## Added

- `api/health.js`
  - Public health endpoint for deployment/runtime checks.
- `api/ai/context-test.js`
  - Protected Supabase-auth endpoint that verifies the current user and programme access.
- `api/shared/*`
  - Small reusable helpers for HTTP responses, Supabase admin access, Gemini access, programme guards, rate limiting, logging, and future RAG utilities.
- `supabase/migrations/001_ai_foundation.sql`
  - Programme-aware schema for RAG documents, chunks, company data, chat memory, resume analyses, and shortlist estimates.
  - `pgvector` extension and `match_document_chunks` RPC.
  - Starter RLS policies for user-owned records.
- `.env.example`
  - Required server-side environment variables.

## Required Environment Variables

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
AI_EMBEDDING_MODEL=gemini-embedding-001
AI_EMBEDDING_DIMENSIONS=1536
AI_CHAT_MODEL=gemini-2.5-flash
AI_ALLOWED_ORIGIN=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in `index.html`.

## Programme Safety Rule

Every AI endpoint should call `assertProgrammeAccess()` before retrieving data. If a student is assigned to BDA, APIs must only retrieve BDA-scoped documents, chunks, companies, resumes, interviews, and shortlist patterns.

## Next Safe Step

Phase 1 should add the AI assistant behind an isolated mount point and namespaced CSS/JS only:

```html
<div id="pg-ai-root"></div>
```

No existing selectors or layout classes should be modified for the assistant.
