/**
 * IASolges.v2 - Puente seguro entre el proceso principal y la interfaz
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const listeners = new Map();
function subscribe(channel, fn) {
  const wrapped = (_evt, data) => fn(data);
  ipcRenderer.on(channel, wrapped);
  listeners.set(fn, { channel, wrapped });
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
    listeners.delete(fn);
  };
}

contextBridge.exposeInMainWorld('api', {
  /* Aplicacion */
  info: () => invoke('app:info'),
  exit: () => invoke('app:exit'),
  openExternal: (url) => invoke('app:openExternal', url),
  openPath: (p) => invoke('app:openPath', p),
  showItem: (p) => invoke('app:showItem', p),
  versions: () => invoke('app:version'),

  /* Ajustes y credenciales */
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    reset: () => invoke('settings:reset'),
    openFolder: (which) => invoke('settings:openFolder', which)
  },
  credentials: () => invoke('credentials:get'),

  /* IA */
  ai: {
    catalog: () => invoke('ai:catalog'),
    status: () => invoke('ai:status'),
    opencodeModels: () => invoke('ai:opencodeModels'),
    remoteModels: (provider) => invoke('ai:remoteModels', provider),
    syncAuth: () => invoke('ai:syncAuth'),
    complete: (opts) => invoke('ai:complete', opts),
    run: (opts) => invoke('ai:run', opts),
    cancel: (id) => invoke('ai:cancel', id),
    onEvent: (fn) => subscribe('ai:event', fn)
  },

  /* Terminal */
  terminal: {
    create: (opts) => invoke('terminal:create', opts),
    write: (id, data) => invoke('terminal:write', { id, data }),
    resize: (id, cols, rows) => invoke('terminal:resize', { id, cols, rows }),
    close: (id) => invoke('terminal:close', { id }),
    list: () => invoke('terminal:list'),
    cwd: (dir) => invoke('terminal:cwd', dir),
    onData: (fn) => subscribe('terminal:data', fn),
    onClose: (fn) => subscribe('terminal:close', fn),
    onOpen: (fn) => subscribe('terminal:open', fn)
  },

  /* Clientes */
  customers: {
    categories: () => invoke('customers:categories'),
    geocode: (q) => invoke('customers:geocode', q),
    reverse: (lat, lon) => invoke('customers:reverse', lat, lon),
    search: (args) => invoke('customers:search', args),
    analysisPrompt: (args) => invoke('customers:analysisPrompt', args),
    save: (clientes, extra) => invoke('customers:save', clientes, extra)
  },

  /* Datos */
  db: {
    clientes: list('clientes'),
    presupuestos: list('presupuestos'),
    proyectos: list('proyectos'),
    trabajos: list('trabajos'),
    analyses: list('analyses')
  },

  /* Presupuestos */
  quotes: {
    servicios: () => invoke('quotes:servicios'),
    generate: (args) => invoke('quotes:generate', args),
    recalculate: (p) => invoke('quotes:recalculate', p),
    export: (args) => invoke('quotes:export', args)
  },

  /* Fabrica */
  factory: {
    tipos: () => invoke('factory:tipos'),
    create: (args) => invoke('factory:create', args),
    tree: (dir) => invoke('factory:tree', dir),
    read: (file) => invoke('factory:read', file),
    onEvent: (fn) => subscribe('factory:event', fn)
  },

  /* Analisis legal */
  legal: {
    normativa: () => invoke('legal:normativa'),
    analyzeUrl: (args) => invoke('legal:analyzeUrl', args),
    analyzeProject: (args) => invoke('legal:analyzeProject', args),
    analyzeText: (args) => invoke('legal:analyzeText', args),
    pickFile: () => invoke('legal:pickFile')
  },

  /* GitHub */
  github: {
    info: () => invoke('github:info'),
    user: () => invoke('github:user'),
    releases: () => invoke('github:releases'),
    publish: (args) => invoke('github:publish', args),
    openRepo: () => invoke('github:openRepo')
  },

  /* Actualizaciones */
  update: {
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: (deb) => invoke('update:install', deb),
    relaunch: () => invoke('update:relaunch'),
    onInfo: (fn) => subscribe('update:info', fn),
    onProgress: (fn) => subscribe('update:progress', fn),
    onStatus: (fn) => subscribe('update:status', fn)
  },

  /* Navegacion interna */
  onNavigate: (fn) => subscribe('ui:navigate', fn),
  onSettingsChanged: (fn) => subscribe('settings:changed', fn),

  /* Ficheros */
  files: {
    save: (args) => invoke('file:save', args),
    open: () => invoke('file:open')
  }
});

function list(name) {
  return {
    all: () => invoke(`db:list:${name}`),
    get: (id) => invoke(`db:get:${name}`, id),
    create: (item) => invoke(`db:insert:${name}`, item),
    update: (id, patch) => invoke(`db:update:${name}`, { id, patch }),
    remove: (id) => invoke(`db:delete:${name}`, id)
  };
}