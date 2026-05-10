# Resume Analyzer - Backend Slice

This slice adds a protected backend endpoint for explainable resume scoring. It does not add frontend UI yet and does not parse binary PDFs yet.

## Endpoint

`POST /api/ai/resume-analyze`

Requires a Supabase bearer token and a server-side assigned programme in `user_profiles`.

Body:

```json
{
  "programme": "bda",
  "resumeText": "Plain text extracted from the student's resume...",
  "targetRole": "Data Analyst",
  "targetCompany": "Deloitte"
}
```

## Scoring Principles

The API does not use random or fake scores. It calculates transparent, explainable scores from resume text:

- ATS structure score
- programme-critical skills coverage
- relevant tools coverage
- role/company alignment
- quantified impact signals
- project relevance signals

The weighted score is deterministic for the same input text.

## Programme-Specific Taxonomies

The scoring utility uses different taxonomies for:

- `bda`
- `bifs`
- `hcm`
- `core`

Example for BDA:

- SQL
- Python
- machine learning
- statistics
- dashboards
- predictive modeling
- segmentation
- churn
- A/B testing

## Limits

- Minimum resume text length: 500 characters
- Maximum resume text length: 80,000 characters
- Rate limit: 8 analyses per authenticated user per minute

## Next Step

Add PDF extraction separately:

1. upload PDF to Supabase Storage,
2. extract text server-side,
3. send extracted text to this scoring engine,
4. optionally store the PDF as a private `documents` row.

Keeping PDF parsing separate prevents large parsing dependencies from bloating every AI endpoint.
