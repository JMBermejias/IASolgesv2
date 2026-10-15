/**
 * IASolges.v2 - Configuracion y rutas de la aplicacion
 * Autor: Jose Manuel Bernabeu Mejias
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const APP_ID = 'IASolges.v2';
const APP_NAME = 'IASolges.v2';

const home = os.homedir();
const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_ID);
const dataDir = path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), APP_ID);
const cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), APP_ID);
const projectsDir = path.join(dataDir, 'proyectos');

function ensureDirs() {
  for (const d of [configDir, dataDir, cacheDir, projectsDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
ensureDirs();

/** Credenciales del titular embebidas en la aplicacion (fichero local, fuera del repo publico) */
function loadCredentials() {
  const local = path.join(dataDir, 'credentials.json');
  const packaged = path.join(process.resourcesPath || '', 'credentials.json');
  const candidates = [local, packaged];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        const parsed = JSON.parse(fs.readFileSync(c, 'utf8'));
        if (parsed && parsed.github && parsed.github.token) return parsed;
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

const DEFAULT_SETTINGS = {
  theme: 'claro',
  provider: 'opencode',
  models: {
    opencode: 'opencode/space-bunny-free',
    openai: 'gpt-5',
    anthropic: 'claude-sonnet-4-5',
    google: 'gemini-2.5-pro',
    openrouter: 'openrouter/auto',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    mistral: 'mistral-large-latest',
    xai: 'grok-4',
    ollama: 'llama3.1'
  },
  agent: 'build',
  apiKeys: {
    openai: '', anthropic: '', google: '', openrouter: '', groq: '',
    deepseek: '', mistral: '', xai: '', ollama: ''
  },
  opencode: {
    binary: '',
    autoApprove: true,
    serverUrl: '',
    thinking: false
  },
  terminal: {
    shell: '',
    cwd: home
  },
  legal: {
    autoAnalyzeOnCreate: true,
    defaultProfile: 'es-ES',
    aiDepth: 'completo'
  },
  factory: {
    rootFolder: projectsDir,
    pushToGithub: true,
    branchPrefix: 'iasolges'
  },
  updates: {
    checkOnStart: true,
    repoOwner: 'JMBermejias',
    repoName: 'IASolgesv2'
  },
  geolocation: {
    userAgent: 'IASolges.v2/2.0 (Jose Manuel Bernabeu Mejias)',
    defaultCenter: { lat: 38.4805, lon: -0.8033 },
    defaultZoom: 13
  },
  quote: {
    currency: 'EUR',
    ivaRate: 21,
    irpfRate: 15,
    marginRate: 25,
    validityDays: 30
  },
  ui: {
    sidebarCollapsed: false,
    language: 'es'
  },
  github: {
    user: 'jmbernabeu',
    repo: 'JMBermejias/IASolgesv2',
    url: 'https://github.com/JMBermejias/IASolgesv2',
    token: ''
  }
};

function deepMerge(base, extra) {
  if (Array.isArray(extra) || typeof extra !== 'object' || extra === null) return extra === undefined ? base : extra;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

const settingsPath = path.join(configDir, 'settings.json');

let cached = null;

function loadSettings() {
  if (cached) return cached;
  try {
    if (fs.existsSync(settingsPath)) {
      const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const merged = deepMerge(DEFAULT_SETTINGS, stored);
      const creds = loadCredentials();
      if (creds) {
        merged.github = { ...merged.github, ...creds.github };
        if (creds.titular) merged.titular = creds.titular;
      }
      cached = merged;
      return merged;
    }
  } catch (e) {
    console.error('[config] no se pudo leer settings.json:', e.message);
  }
  const creds = loadCredentials();
  const fresh = deepMerge(DEFAULT_SETTINGS, {});
  if (creds) {
    fresh.github = { ...fresh.github, ...creds.github };
    if (creds.titular) fresh.titular = creds.titular;
  }
  cached = fresh;
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(fresh, null, 2), 'utf8');
  } catch (e) {
    console.error('[config] no se pudo guardar settings.json:', e.message);
  }
  return fresh;
}
function saveSettings(patch) {
  const current = cached || loadSettings();
  cached = deepMerge(current, patch || {});
  fs.writeFileSync(settingsPath, JSON.stringify(cached, null, 2), 'utf8');
  return cached;
}
function getSettings() {
  if (!cached) cached = loadSettings();
  return cached;
}

module.exports = {
  APP_ID,
  APP_NAME,
  configDir,
  dataDir,
  cacheDir,
  projectsDir,
  settingsPath,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  deepMerge,
  paths: { home, os: os.platform() }
};