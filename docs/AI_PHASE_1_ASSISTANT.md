# AI Assistant - Phase 1 Slice

This slice adds a programme-aware assistant without changing the existing placement hub experience.

## Frontend Integration

Only three additive changes were made to `index.html`:

- include `assets/ai/ai-assistant.css`
- add `<div id="pg-ai-root"></div>`
- include `assets/ai/ai-assistant.js`

The assistant uses only `.pg-ai-*` CSS classes and does not modify existing navbar, auth, ticker, programme selector, dashboard, company, role, roadmap, cheat sheet, or download behavior.

## Backend Flow

`POST /api/ai/chat`

1. Requires Supabase bearer token.
2. Rate-limits per authenticated user.
3. Loads the user's assigned programme.
4. Rejects mismatched programme requests.
5. Embeds the question with the configured embedding model.
6. Retrieves chunks through `match_document_chunks` with programme filtering.
7. Generates an answer with the configured chat model.
8. Stores user and assistant messages in `chat_messages`.
9. Returns markdown text plus source citations.

## Current Limitations

- Responses are non-streaming in this first slice.
- Real answer quality depends on documents being ingested into `documents` and `document_chunks`.
- If no chunks exist yet, the assistant should explain that context is missing and provide cautious general guidance.

## Required Before Production Use

- Apply `supabase/migrations/001_ai_foundation.sql`.
- Set Vercel environment variables from `.env.example`.
- Upload and ingest programme-specific documents.
- Add a proper admin ingestion flow.
- Add moderation and more durable rate limiting.
