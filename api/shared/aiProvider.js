const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export function isAiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getAiModels() {
  return {
    provider: 'gemini',
    chatModel: process.env.AI_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: Number(process.env.AI_EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS)
  };
}

export async function generateChatCompletion({ model, systemInstruction, prompt }) {
  const selectedModel = model || getAiModels().chatModel;

  // Primary: Gemini
  try {
    const response = await geminiFetch(`models/${selectedModel}:generateContent`, {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, topP: 0.9 }
    });
    const answer = extractGeminiText(response);
    if (!answer) {
      const finishReason = response?.candidates?.[0]?.finishReason || 'unknown';
      throw new Error(`Gemini returned no text. finishReason=${finishReason}`);
    }
    return { answer, model: selectedModel };
  } catch (geminiErr) {
    // Fallback: Groq (Llama 3.3 70B)
    if (!process.env.GROQ_API_KEY) throw geminiErr;
    try {
      const answer = await groqChat(systemInstruction, prompt);
      if (!answer) throw new Error('Groq returned no text.');
      return { answer, model: GROQ_MODEL };
    } catch {
      throw geminiErr; // surface original Gemini error if both fail
    }
  }
}

export async function embedTextWithProvider(text) {
  const { embeddingModel, embeddingDimensions } = getAiModels();
  const response = await geminiFetch(`models/${embeddingModel}:embedContent`, {
    model: `models/${embeddingModel}`,
    content: {
      parts: [{ text }]
    },
    taskType: 'RETRIEVAL_QUERY',
    outputDimensionality: embeddingDimensions
  });

  const values = response?.embedding?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Gemini returned no embedding values.');
  }

  return values;
}

async function geminiFetch(path, body) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY.');
  }

  const response = await fetch(`${GEMINI_API_BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Gemini API request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.provider = 'gemini';
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractGeminiText(response) {
  return (response?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();
}

async function groqChat(systemInstruction, prompt) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [
        { role: 'system', content: systemInstruction },
        { role: 'user',   content: prompt }
      ],
      temperature: 0.4,
      max_tokens:  2048,
      top_p:       0.9
    })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error (${r.status})`);
  }
  const payload = await r.json();
  return payload?.choices?.[0]?.message?.content || '';
}
