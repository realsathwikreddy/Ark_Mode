// One place that talks to an AI model: Gemini (free key from Google AI Studio) or Claude (your Anthropic key).
// Everything that needs a model (Ark, Plan with Ark, Radar smart filter) goes through ask() here.
import { ask as askClaude } from './claude.js';

export function brainOf(settings) {
  const pick = settings.brain || 'gemini';
  const g = settings.gemini?.key, c = settings.claude?.key;
  if (pick === 'gemini' && g) return 'gemini';
  if (pick === 'claude' && c) return 'claude';
  return g ? 'gemini' : c ? 'claude' : null;
}
export const hasBrain = (settings) => !!brainOf(settings);
export const brainLabel = (settings) => ({ gemini: 'Gemini', claude: 'Claude' }[brainOf(settings)] || 'none');

export async function ask(settings, opts) {
  const b = brainOf(settings);
  if (b === 'claude') return askClaude(settings, opts);
  if (b === 'gemini') return askGemini(settings, opts);
  throw new Error('Add a Gemini or Claude API key in You → Ark’s brain first.');
}

// ---------- Gemini ----------
const G = 'https://generativelanguage.googleapis.com/v1beta';
let modelCache = null;

// Google renames models every few months, so pick from what the key can actually use:
// newest Flash first, then Flash-Lite as the fallback when Flash is out of free quota.
export function rankModels(names) {
  const bad = /(image|tts|audio|live|embed|vision|thinking-exp|exp-|learnlm|gemma|aqa|native|computer|robotics|veo|imagen)/i;
  const ver = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 0; };
  const list = names.map((n) => n.replace(/^models\//, '')).filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !bad.test(n));
  const score = (n) => ver(n) * 10 - (/lite/.test(n) ? 5 : 0) - (/preview/.test(n) ? 2 : 0) - (/-\d{3,}$/.test(n) ? 1 : 0);
  return [...new Set(list)].sort((a, b) => score(b) - score(a));
}

async function geminiModels(key) {
  if (modelCache?.key === key) return modelCache.list;
  const r = await fetch(`${G}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw geminiError(r.status, j);
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name);
  const ranked = rankModels(names);
  const full = ranked.filter((n) => !/lite/.test(n));
  const lite = ranked.filter((n) => /lite/.test(n));
  const list = [full[0], lite[0], full[1]].filter(Boolean);
  if (!list.length) throw new Error('This Gemini key has no Flash models available.');
  modelCache = { key, list };
  return list;
}

function geminiError(status, j) {
  const msg = j?.error?.message || `HTTP ${status}`;
  if (status === 400 && /API key/i.test(msg)) return Object.assign(new Error('That Gemini key was rejected. Check it in You → Ark’s brain.'), { status: 401 });
  if (status === 401 || status === 403) return Object.assign(new Error('That Gemini key was rejected. Check it in You → Ark’s brain.'), { status });
  if (status === 429) return Object.assign(new Error('Gemini’s free limit is used up for now. It resets daily.'), { status });
  return Object.assign(new Error(msg), { status });
}

async function askGemini(settings, { system, prompt, maxTokens = 1500, json = false }) {
  const key = settings.gemini.key;
  const models = settings.gemini.model ? [settings.gemini.model] : await geminiModels(key);
  let last;
  for (const model of models) {
    const r = await fetch(`${G}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Thinking models spend part of the budget thinking, so leave room.
        generationConfig: { maxOutputTokens: Math.max(2048, maxTokens * 3), temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const parts = j.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (text) return text;
      last = new Error(j.candidates?.[0]?.finishReason === 'SAFETY' ? 'Gemini refused that one.' : 'Gemini sent back an empty reply.');
      continue;
    }
    last = geminiError(r.status, j);
    if (r.status === 429 || r.status === 404 || r.status >= 500) continue; // try the next model
    throw last;
  }
  throw last;
}

export async function testBrain(settings) {
  modelCache = null;
  await ask(settings, { system: 'Reply with OK.', prompt: 'ping', maxTokens: 5 });
  return true;
}
export const geminiModelsFor = (key) => { modelCache = null; return geminiModels(key); };
