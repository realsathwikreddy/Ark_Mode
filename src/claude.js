// Talks to the Claude API with Sathwik's own key (stored only on this phone).
export const MODELS = [
  { id: 'claude-sonnet-5-5', name: 'Sonnet (smarter)' },
  { id: 'claude-haiku-5-5', name: 'Haiku (faster, cheaper)' },
];

export async function ask(settings, { system, prompt, maxTokens = 1500 }) {
  const key = settings.claude?.key;
  if (!key) throw new Error('Add your Claude API key in You → Settings first.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.claude?.model || MODELS[0].id,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    if (r.status === 401) throw new Error('That API key was rejected. Check it in Settings.');
    if (r.status === 429) throw new Error('Rate limited by the API. Try again in a minute.');
    throw new Error(msg);
  }
  return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}

// Pull the first JSON value out of a reply, even if it's wrapped in prose or a code fence.
export function parseJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = m ? m[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('Claude did not return a plan.');
  const open = body[start];
  const close = open === '[' ? ']' : '}';
  const end = body.lastIndexOf(close);
  return JSON.parse(body.slice(start, end + 1));
}

export async function testKey(settings) {
  await ask(settings, { system: 'Reply with OK.', prompt: 'ping', maxTokens: 5 });
  return true;
}
