# Programme-Specific AI Data Ingestion

This slice adds admin-only ingestion APIs for text-like content. It is designed to seed the RAG system without changing the existing frontend.

## Endpoints

### `POST /api/admin/upload-document`

Creates a `documents` row in `pending` state. Requires an authenticated Supabase user whose `user_profiles.role` is `admin`.

Body:

```json
{
  "programme": "bda",
  "type": "interview_experience",
  "title": "BDA Deloitte Interview Notes 2024",
  "content": "Long source text...",
  "sourceUrl": "optional",
  "metadata": {
    "company": "Deloitte",
    "year": "2024",
    "role": "Analyst"
  }
}
```

Returns a `document.id`.

### `POST /api/admin/ingest-document`

Parses, chunks, embeds, and indexes an uploaded document.

Body:

```json
{
  "documentId": "uuid"
}
```

Flow:

1. Loads the pending document.
2. Reads `metadata.rawContent`.
3. Cleans and chunks text.
4. Generates embeddings using `AI_EMBEDDING_MODEL`.
5. Inserts rows into `document_chunks`.
6. Marks the document `ready`.

## Supported Content In This Slice

- Pasted text
- Markdown
- Structured text exported from PDFs
- JSON converted to plain text before upload

PDF binary upload/parsing should be added next via a dedicated parser path, because Vercel function size and timeout limits need careful handling.

## Programme Isolation

Every document and chunk stores `programme_id`. Retrieval through `match_document_chunks` filters by `programme_code_filter`, and the chat API requires a server-side assigned programme before answering.

## Document Types

- `placement_report`
- `resume`
- `interview_experience`
- `company_document`
- `roadmap`
- `prep_material`
- `shortlist_data`
- `role_data`

## Next Step

Add a lightweight admin UI or CLI script that:

1. accepts files,
2. extracts text,
3. sends text to `/api/admin/upload-document`,
4. calls `/api/admin/ingest-document`,
5. shows ingestion status and chunk count.
