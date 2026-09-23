/**
 * OpenAI adapter. Fails closed (503) when OPENAI_API_KEY is absent. Used for
 * resume parsing and referral-card screening.
 */
import { config } from '../config/env';
import { AppError } from '../utils/AppError';

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';

export function isEnabled(): boolean {
  return config.aiEnabled;
}

/** Runs a JSON-mode chat completion and returns the parsed object. */
export async function chatJson<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1200,
): Promise<T> {
  if (!config.OPENAI_API_KEY) {
    throw new AppError(503, 'AI features are not configured on this server', { code: 'ai_unconfigured' });
  }
  const res = await fetch(OPENAI_CHAT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, `OpenAI request failed (${res.status})`, {
      code: 'gateway_error',
      details: text.slice(0, 500),
    });
  }
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AppError(502, 'AI returned malformed JSON', { code: 'ai_bad_response' });
  }
}
