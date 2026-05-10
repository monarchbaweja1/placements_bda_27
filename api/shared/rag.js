import { getAiModels, getOpenAIClient } from './openai.js';

export async function embedText(text) {
  const { embeddingModel } = getAiModels();
  const openai = getOpenAIClient();

  const response = await openai.embeddings.create({
    model: embeddingModel,
    input: text
  });

  return response.data[0].embedding;
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
