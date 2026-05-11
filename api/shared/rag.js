import { embedTextWithProvider } from './aiProvider.js';

export async function embedText(text) {
  return embedTextWithProvider(text);
}

export async function retrieveProgrammeChunks({ supabase, queryEmbedding, programmeCode, matchCount = 8 }) {
  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    programme_code_filter: programmeCode
  });

  if (error) throw error;
  return data || [];
}
