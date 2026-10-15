/**
 * IASolges.v2 - Catalogo de proveedores y modelos de IA
 * OpenCode (proveedor principal) + proveedores directos integratedos.
 */

const OPEN_CODE_STYLE = 'opencode';
const OPENAI_STYLE = 'openai';
const ANTHROPIC_STYLE = 'anthropic';
const GEMINI_STYLE = 'gemini';

/** Modelos sugeridos de OpenCode que aparecen siempre, incluso sin sesion iniciada */
const OPENCODE_HINTS = [
  'opencode/space-bunny-free',
  'opencode/big-pickle',
  'opencode/cat-jam-free',
  'opencode/deepseek-v4.1-flash-free',
  'opencode/longcat-2.5-preview-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/muse-spark-1.3-contributor-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/nemotron-3.5-super-vl-free',
  'opencode/step-5-preview-free'
];

const PROVIDERS = [
  {
    id: 'opencode',
    name: 'OpenCode',
    style: OPEN_CODE_STYLE,
    description: 'Proveedor principal. Usa el motor y los modelos de OpenCode con agentes especializados.',
    keyField: null,
    baseUrl: '',
    color: '#111827',
    defaultModel: 'opencode/space-bunny-free',
    models: OPENCODE_HINTS,
    needsKey: false
  },
  {
    id: 'openai',
    name: 'OpenAI',
    style: OPENAI_STYLE,
    description: 'Modelos GPT de OpenAI (compatible con API Chat Completions).',
    keyField: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    color: '#10a37f',
    defaultModel: 'gpt-5',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
    needsKey: true
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    style: ANTHROPIC_STYLE,
    description: 'Familia Claude, excelente para analisis Extended y programacion.',
    keyField: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    color: '#d97757',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    needsKey: true
  },
  {
    id: 'google',
    name: 'Google Gemini',
    style: GEMINI_STYLE,
    description: 'Modelos Gemini con contexto muy largo.',
    keyField: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    color: '#4285f4',
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    needsKey: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    style: OPENAI_STYLE,
    description: 'Agregador con acceso a cientos de modelos de todos los proveedores.',
    keyField: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    color: '#6467f2',
    defaultModel: 'openrouter/auto',
    models: [
      'openrouter/auto', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro',
      'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct', 'qwen/qwen-2.5-coder-32b-instruct',
      'mistralai/mistral-large', 'x-ai/grok-4'
    ],
    needsKey: true
  },
  {
    id: 'groq',
    name: 'Groq',
    style: OPENAI_STYLE,
    description: 'Inferencia de latencia ultra baja.',
    keyField: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    color: '#f55036',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-120b'],
    needsKey: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    style: OPENAI_STYLE,
    description: 'Modelos de codigo y razonamiento muy economicos.',
    keyField: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    color: '#4d6bfe',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    needsKey: true
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    style: OPENAI_STYLE,
    description: 'Modelos europeos abiertos y propietarios.',
    keyField: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    color: '#ff7000',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    needsKey: true
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    style: OPENAI_STYLE,
    description: 'Modelos Grok.',
    keyField: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    color: '#000000',
    defaultModel: 'grok-4',
    models: ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini'],
    needsKey: true
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    style: OPENAI_STYLE,
    description: 'Modelos ejecutados en local, sin coste y sin envio de datos.',
    keyField: null,
    baseUrl: 'http://127.0.0.1:11434/v1',
    color: '#111111',
    defaultModel: 'qwen2.5-coder',
    models: ['qwen2.5-coder', 'llama3.1', 'deepseek-r1', 'mistral', 'gemma3'],
    needsKey: false
  }
];

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

function catalog() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    style: p.style,
    color: p.color,
    baseUrl: p.baseUrl,
    needsKey: p.needsKey,
    keyField: p.keyField,
    defaultModel: p.defaultModel,
    models: p.models
  }));
}

module.exports = { PROVIDERS, getProvider, catalog, OPENCODE_HINTS };