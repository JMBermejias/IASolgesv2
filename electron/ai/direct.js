/**
 * IASolges.v2 - Cliente directo para proveedores de IA (OpenAI, Anthropic, Gemini, OpenRouter, ...)
 * Streaming por SSE usando fetch nativo de Node/Electron.
 */
const { getProvider } = require('./providers');
const { getSettings } = require('../config');

function getAbort(signalId) {
  const engine = require('./engine');
  return engine.attachAbort(signalId);
}

async function* sseLines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const p of parts) yield p;
  }
  if (buffer) yield buffer;
}

async function runOpenAIStyle({ provider, model, system, prompt, apiKey, baseUrl, onEvent, signalId }) {
  const url = `${baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/JMBermejias/IASolgesv2';
    headers['X-Title'] = 'IASolges.v2';
  }
  const body = {
    model,
    stream: true,
    temperature: 0.4,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ]
  };

  onEvent({ type: 'status', message: `Conectando con ${provider.name} · ${model}` });
  const controller = new AbortController();
  getAbort(signalId, controller);

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${provider.name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  let full = '';
  for await (const line of sseLines(res)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const data = t.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta;
      const piece = delta?.content || delta?.reasoning_content || json.choices?.[0]?.message?.content;
      if (piece) { full += piece; onEvent({ type: 'token', text: piece }); }
      else if (json.choices?.[0]?.finish_reason) onEvent({ type: 'meta', meta: { finish: json.choices[0].finish_reason } });
    } catch (_) { /* fragmento incompleto */ }
  }
  onEvent({ type: 'end', code: 0, text: full });
}

async function runAnthropic({ provider, model, system, prompt, apiKey, baseUrl, onEvent, signalId }) {
  const url = `${baseUrl}/messages`;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };
  const body = {
    model,
    max_tokens: 8192,
    stream: true,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }]
  };

  onEvent({ type: 'status', message: `Conectando con ${provider.name} · ${model}` });
  const controller = new AbortController();
  getAbort(signalId, controller);

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${provider.name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  let full = '';
  for await (const line of sseLines(res)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const data = t.slice(5).trim();
    try {
      const json = JSON.parse(data);
      if (json.type === 'content_block_delta' && json.delta?.text) {
        full += json.delta.text;
        onEvent({ type: 'token', text: json.delta.text });
      } else if (json.type === 'error') {
        throw new Error(json.error?.message || 'Error de Anthropic');
      }
    } catch (e) {
      if (e.message && !e.message.startsWith('Unexpected')) onEvent({ type: 'log', text: `[anthropic] ${e.message}` });
    }
  }
  onEvent({ type: 'end', code: 0, text: full });
}

async function runGemini({ provider, model, system, prompt, apiKey, baseUrl, onEvent, signalId }) {
  const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4 }
  };

  onEvent({ type: 'status', message: `Conectando con ${provider.name} · ${model}` });
  const controller = new AbortController();
  getAbort(signalId, controller);

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${provider.name} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  let full = '';
  for await (const line of sseLines(res)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const data = t.slice(5).trim();
    try {
      const json = JSON.parse(data);
      const parts = json.candidates?.[0]?.content?.parts || [];
      const piece = parts.map((p) => p.text || '').join('');
      if (piece) { full += piece; onEvent({ type: 'token', text: piece }); }
    } catch (_) { /* ignore */ }
  }
  onEvent({ type: 'end', code: 0, text: full });
}

/** Consulta los modelos disponibles de un proveedor compatible con OpenAI */
async function listRemoteModels(providerId, apiKey) {
  const provider = getProvider(providerId);
  if (!apiKey) return { ok: false, error: 'Falta la clave de API', models: [] };
  if (provider.style === 'anthropic') {
    const res = await fetch(`${provider.baseUrl}/models?limit=100`, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
    const json = await res.json();
    return { ok: res.ok, models: (json.data || []).map((m) => m.id), error: res.ok ? null : JSON.stringify(json).slice(0, 300) };
  }
  if (provider.style === 'gemini') {
    const res = await fetch(`${provider.baseUrl}/models?key=${encodeURIComponent(apiKey)}`);
    const json = await res.json();
    return { ok: res.ok, models: (json.models || []).map((m) => m.name.replace('models/', '')), error: res.ok ? null : JSON.stringify(json).slice(0, 300) };
  }
  const res = await fetch(`${provider.baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = await res.json();
  return { ok: res.ok, models: (json.data || []).map((m) => m.id).sort(), error: res.ok ? null : JSON.stringify(json).slice(0, 300) };
}

async function run(opts) {
  const { provider: providerId, model } = opts;
  const settings = getSettings();
  const provider = getProvider(providerId || settings.provider);
  const apiKey = (settings.apiKeys || {})[providerId || provider.id] || '';
  const baseUrl = (settings.baseUrls && settings.baseUrls[provider.id]) || provider.baseUrl;

  if (provider.needsKey && !apiKey && provider.id !== 'ollama') {
    throw new Error(`Falta la clave de API para ${provider.name}. Anadela en Ajustes > Proveedores.`);
  }

  const args = { ...opts, provider, apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
  if (provider.style === 'anthropic') return runAnthropic(args);
  if (provider.style === 'gemini') return runGemini(args);
  return runOpenAIStyle(args);
}

module.exports = { run, listRemoteModels };