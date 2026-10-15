/**
 * IASolges.v2 - Puente con OpenCode (proveedor principal)
 * Gestiona binario, modelos disponibles, credenciales y ejecuciones con streaming.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSettings } = require('../config');

const BIN_CANDIDATES = [
  path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
  path.join(os.homedir(), '.local', 'bin', 'opencode'),
  '/usr/local/bin/opencode',
  '/usr/bin/opencode'
];

let cachedBin = null;

function findBinary() {
  if (cachedBin) return cachedBin;
  const cfg = getSettings().opencode || {};
  const candidates = [cfg.binary, ...BIN_CANDIDATES].filter(Boolean);
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      cachedBin = c;
      return cachedBin;
    } catch (_) { /* siguiente */ }
  }
  try {
    const which = spawnSync('bash', ['-lc', 'command -v opencode'], { encoding: 'utf8' });
    const found = (which.stdout || '').trim();
    if (found) { cachedBin = found; return found; }
  } catch (_) { /* ignore */ }
  cachedBin = null;
  return null;
}

function authFile() {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'opencode', 'auth.json');
}

/** Sincroniza las claves introducidas en la app con elalmacen de credenciales de OpenCode */
function syncCredentials(apiKeys) {
  const file = authFile();
  let current = {};
  try {
    if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) { current = {}; }

  const map = {
    openai: { type: 'api', key: apiKeys.openai, env: ['OPENAI_API_KEY'] },
    anthropic: { type: 'api', key: apiKeys.anthropic, env: ['ANTHROPIC_API_KEY'] },
    google: { type: 'api', key: apiKeys.google, env: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] },
    openrouter: { type: 'api', key: apiKeys.openrouter, env: ['OPENROUTER_API_KEY'] },
    groq: { type: 'api', key: apiKeys.groq, env: ['GROQ_API_KEY'] },
    deepseek: { type: 'api', key: apiKeys.deepseek, env: ['DEEPSEEK_API_KEY'] },
    mistral: { type: 'api', key: apiKeys.mistral, env: ['MISTRAL_API_KEY'] },
    xai: { type: 'api', key: apiKeys.xai, env: ['XAI_API_KEY'] }
  };

  let changed = false;
  for (const [provider, cfg] of Object.entries(map)) {
    if (!cfg.key) continue;
    const prev = current[provider];
    if (!prev || prev.key !== cfg.key) {
      current[provider] = { type: 'api', key: cfg.key };
      changed = true;
    }
  }
  if (changed) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      return { ok: false, error: e.message, file };
    }
  }
  return { ok: true, file, changed, providers: Object.keys(current) };
}

function runOpencode(args, opts = {}) {
  const bin = findBinary();
  if (!bin) return { ok: false, error: 'No se ha encontrado el binario de OpenCode', code: -1 };
  const res = spawnSync(bin, args, {
    cwd: opts.cwd || os.homedir(),
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    env: { ...process.env, NO_COLOR: '1' }
  });
  return {
    ok: res.status === 0,
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.status === 0 ? null : (res.stderr || res.error?.message || 'Error desconocido')
  };
}

function version() {
  const r = runOpencode(['--version'], { timeout: 20000 });
  return r.ok ? (r.stdout || '').trim() : null;
}

/** Lista de modelos de OpenCode segun credenciales configuradas */
function listModels() {
  const r = runOpencode(['models'], { timeout: 90000 });
  const models = (r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('/'));
  if (!models.length && r.error) return { ok: false, error: r.error, models: [] };
  return { ok: true, models, warning: models.length ? null : 'No hay modelos disponibles: revisa las credenciales de los proveedores' };
}

/** Extrae texto de los eventos JSON emitidos por `opencode run --format json` */
function extractText(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj === 'string') return obj;
  const part = obj.part || (obj.properties && obj.properties.part);
  if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
  if (typeof obj.text === 'string') return obj.text;
  if (obj.message && typeof obj.message === 'object' && typeof obj.message.text === 'string') return obj.message.text;
  if (typeof obj.content === 'string') return obj.content;
  if (Array.isArray(obj.content)) {
    const joined = obj.content.filter((c) => c && c.type === 'text' && c.text).map((c) => c.text).join('');
    if (joined) return joined;
  }
  if (obj.data && typeof obj.data === 'object') return extractText(obj.data);
  return null;
}

function extractSessionId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [obj.sessionID, obj.sessionId, obj.session_id];
  for (const c of candidates) if (typeof c === 'string' && c) return c;
  if (obj.properties) {
    const p = obj.properties;
    for (const c of [p.sessionID, p.sessionId, p.info && p.info.id]) if (typeof c === 'string' && c) return c;
  }
  if (obj.session && typeof obj.session === 'object' && obj.session.id) return obj.session.id;
  return null;
}

/**
 * Ejecuta una peticion en OpenCode con salida en streaming.
 * onEvent(evt) -> {type:'token'|'status'|'tool'|'error'|'end', ...}
 */
function run({ prompt, model, agent, cwd, sessionId, onEvent, signalId, files = [] }) {
  const settings = getSettings();
  const bin = findBinary();
  if (!bin) {
    onEvent({ type: 'error', message: 'No se ha encontrado el ejecutable de OpenCode. Configuralo en Ajustes.' });
    onEvent({ type: 'end', code: -1 });
    return;
  }

  const args = ['run', '--format', 'json'];
  if (settings.opencode?.autoApprove) args.push('--auto');
  if (settings.opencode?.thinking) args.push('--thinking');
  if (model) args.push('--model', model);
  if (agent) args.push('--agent', agent);
  if (sessionId) args.push('--session', sessionId);
  if (files && files.length) {
    for (const f of files) args.push('--file', f);
  }
  args.push(prompt);

  onEvent({ type: 'status', message: `Ejecutando OpenCode ${bin}${model ? ` · ${model}` : ''}${agent ? ` · agente ${agent}` : ''}` });

  const child = spawn(bin, args, {
    cwd: cwd || os.homedir(),
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const registry = require('./engine').registerProcess(signalId, child);

  let buffer = '';
  let full = '';
  let detectedSession = sessionId || null;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let evt = null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { evt = JSON.parse(trimmed); } catch (_) { evt = null; }
    }
    if (evt) {
      const sid = extractSessionId(evt);
      if (sid) { detectedSession = sid; onEvent({ type: 'session', sessionId: sid }); }
      const text = extractText(evt);
      if (text) {
        full += text;
        onEvent({ type: 'token', text });
        return;
      }
      const t = evt.type || evt.event || '';
      if (t) onEvent({ type: 'meta', meta: evt });
      return;
    }
    // salida no JSON
    full += trimmed + '\n';
    onEvent({ type: 'token', text: trimmed });
  };

  child.stdout.on('data', (buf) => {
    buffer += buf.toString();
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const p of parts) handleLine(p);
  });

  child.stderr.on('data', (buf) => {
    const text = buf.toString();
    if (text.trim()) onEvent({ type: 'log', text });
  });

  child.on('error', (err) => {
    onEvent({ type: 'error', message: err.message });
    onEvent({ type: 'end', code: -1 });
  });

  child.on('close', (code) => {
    if (buffer) handleLine(buffer);
    require('./engine').unregisterProcess(signalId);
    onEvent({ type: 'end', code, text: full, sessionId: detectedSession });
  });

  return child;
}

module.exports = {
  findBinary,
  authFile,
  syncCredentials,
  listModels,
  version,
  run,
  extractText,
  extractSessionId
};