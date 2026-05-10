import OpenAI from 'openai';

let openaiClient;

export function getOpenAIClient() {
  if (openaiClient) return openaiClient;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY.');
  }

  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export function getAiModels() {
  return {
    chatModel: process.env.AI_CHAT_MODEL || 'gpt-4.1-mini',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimensions: 1536
  };
}
