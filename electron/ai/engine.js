/**
 * IASolges.v2 - Motor de IA unificado (OpenCode + proveedores directos)
 */
const { EventEmitter } = require('events');
const opencode = require('./opencode');
const direct = require('./direct');
const { catalog, getProvider } = require('./providers');
const { getSettings } = require('../config');

/** Registro de procesos en ejecucion para poder cancelarlos */
const processes = new Map();
const aborts = new Map();

function registerProcess(id, child) {
  if (id) processes.set(id, child);
  return child;
}
function unregisterProcess(id) {
  if (id) processes.delete(id);
}
function attachAbort(id, controller) {
  if (id) aborts.set(id, controller);
  return controller;
}
function cancel(id) {
  let cancelled = false;
  const child = processes.get(id);
  if (child) { try { child.kill('SIGTERM'); cancelled = true; } catch (_) { /* ignore */ } }
  const controller = aborts.get(id);
  if (controller) { try { controller.abort(); cancelled = true; } catch (_) { /* ignore */ } }
  if (cancelled) { processes.delete(id); aborts.delete(id); }
  return cancelled;
}

/**
 * Ejecuta una peticion de IA con streaming de eventos.
 * onEvent(evt) eventos: status | token | log | meta | error | end
 */
async function run(opts) {
  const settings = getSettings();
  const providerId = opts.provider || settings.provider || 'opencode';
  const model = opts.model || settings.models?.[providerId] || getProvider(providerId).defaultModel;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const onEvent = opts.onEvent || ((e) => emitter.emit('event', e));

  try {
    if (providerId === 'opencode') {
      const sync = opencode.syncCredentials(settings.apiKeys || {});
      if (!sync.ok) onEvent({ type: 'log', text: `[opencode] No se pudieron guardar credenciales: ${sync.error}` });
      opencode.run({
        prompt: opts.prompt,
        model,
        agent: opts.agent || settings.agent || 'build',
        cwd: opts.cwd,
        sessionId: opts.sessionId,
        files: opts.files || [],
        signalId: opts.signalId,
        onEvent
      });
    } else {
      await direct.run({ ...opts, provider: providerId, model, onEvent, signalId: opts.signalId });
    }
  } catch (err) {
    onEvent({ type: 'error', message: err.message || String(err) });
    onEvent({ type: 'end', code: -1, text: '' });
  }
  return { providerId, model };
}

/** Ejecuta y devuelve el texto completo (sin streaming) */
function complete(opts) {
  return new Promise(async (resolve, reject) => {
    let text = '';
    let failed = null;
    await run({
      ...opts,
      onEvent: (evt) => {
        if (evt.type === 'token') text += evt.text;
        if (evt.type === 'error') failed = evt.message;
        if (evt.type === 'end') {
          if (evt.type === 'end' && failed && !text) reject(new Error(failed));
          else resolve({ text, sessionId: evt.sessionId || opts.sessionId || null, code: evt.code });
        }
      }
    });
  });
}

/** Extrae JSON (con o sin ```json) del texto de un modelo */
function parseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '```').replace(/^```[a-z]*$/gim, '');
  const candidates = [];
  const fence = cleaned.match(/```([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  candidates.push(cleaned);
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(cleaned.slice(first, last + 1));
  const arrFirst = cleaned.indexOf('[');
  const arrLast = cleaned.lastIndexOf(']');
  if (arrFirst !== -1 && arrLast > arrFirst) candidates.push(cleaned.slice(arrFirst, arrLast + 1));

  for (const c of candidates) {
    try { return JSON.parse(c); } catch (_) { /* siguiente */ }
  }
  return null;
}

/** Estado de configuracion de cada proveedor */
function status() {
  const settings = getSettings();
  return catalog().map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.id === 'opencode' || p.id === 'ollama' ? true : Boolean((settings.apiKeys || {})[p.id]),
    model: settings.models?.[p.id] || p.defaultModel,
    needsKey: p.needsKey
  }));
}

/** Pide JSON al modelo y repara la respuesta si llega truncada o con texto alrededor */
async function askJson(prompt, system, opts = {}) {
  const res = await complete({ prompt, system, ...opts });
  let parsed = parseJson(res.text);
  if (parsed) return { data: parsed, text: res.text, repaired: false };

  if (res.text && res.text.length > 80) {
    try {
      const fix = await complete({
        prompt:
`El texto siguiente debe convertirse en JSON valido y COMPLETO. No anadas explicaciones, no uses comillas Markdown y no lo truncas. Si estaba incompleto, completa los campos que falten con valores coherentes.

TEXTO:
${res.text.slice(0, 14000)}`,
        system: 'Devuelves exclusivamente un objeto JSON valido, sin ningun texto alrededor.',
        ...opts
      });
      parsed = parseJson(fix.text);
      if (parsed) return { data: parsed, text: fix.text, repaired: true };
    } catch (_) { /* ignore */ }
  }
  return { data: null, text: res.text, repaired: false };
}

module.exports = { run, complete, cancel, parseJson, status, catalog, askJson, registerProcess, unregisterProcess, attachAbort };