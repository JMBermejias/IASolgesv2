/** Capa fina sobre window.api: desenvuelve {ok,data,error} y normaliza errores */

export async function unwrap(promise) {
  const res = await promise;
  if (!res) return null;
  if (res.ok === false) throw new Error(res.error || 'Error desconocido');
  return res.data;
}

export const api = {
  info: () => unwrap(window.api.info()),
  exit: () => unwrap(window.api.exit()),
  openExternal: (u) => unwrap(window.api.openExternal(u)),
  openPath: (p) => unwrap(window.api.openPath(p)),
  versions: () => unwrap(window.api.versions()),

  settings: {
    get: () => unwrap(window.api.settings.get()),
    set: (patch) => unwrap(window.api.settings.set(patch)),
    reset: () => unwrap(window.api.settings.reset()),
    openFolder: (w) => unwrap(window.api.settings.openFolder(w))
  },
  credentials: () => unwrap(window.api.credentials()),

  ai: {
    catalog: () => unwrap(window.api.ai.catalog()),
    status: () => unwrap(window.api.ai.status()),
    opencodeModels: () => unwrap(window.api.ai.opencodeModels()),
    remoteModels: (p) => unwrap(window.api.ai.remoteModels(p)),
    syncAuth: () => unwrap(window.api.ai.syncAuth()),
    complete: (o) => unwrap(window.api.ai.complete(o)),
    run: (o) => unwrap(window.api.ai.run(o)),
    cancel: (id) => unwrap(window.api.ai.cancel(id)),
    onEvent: (fn) => window.api.ai.onEvent(fn)
  },

  terminal: {
    create: (o) => unwrap(window.api.terminal.create(o)),
    write: (id, d) => window.api.terminal.write(id, d),
    resize: (id, c, r) => window.api.terminal.resize(id, c, r),
    close: (id) => window.api.terminal.close(id),
    list: () => unwrap(window.api.terminal.list()),
    cwd: (d) => unwrap(window.api.terminal.cwd(d)),
    onData: (fn) => window.api.terminal.onData(fn),
    onClose: (fn) => window.api.terminal.onClose(fn),
    onOpen: (fn) => window.api.terminal.onOpen(fn)
  },

  customers: {
    categories: () => unwrap(window.api.customers.categories()),
    geocode: (q) => unwrap(window.api.customers.geocode(q)),
    reverse: (a, b) => unwrap(window.api.customers.reverse(a, b)),
    search: (a) => unwrap(window.api.customers.search(a)),
    analysisPrompt: (a) => unwrap(window.api.customers.analysisPrompt(a)),
    save: (c, e) => unwrap(window.api.customers.save(c, e))
  },

  db: {
    clientes: dbCollection('clientes'),
    presupuestos: dbCollection('presupuestos'),
    proyectos: dbCollection('proyectos'),
    trabajos: dbCollection('trabajos'),
    analyses: dbCollection('analyses')
  },

  quotes: {
    servicios: () => unwrap(window.api.quotes.servicios()),
    generate: (a) => unwrap(window.api.quotes.generate(a)),
    recalculate: (p) => unwrap(window.api.quotes.recalculate(p)),
    export: (a) => unwrap(window.api.quotes.export(a))
  },

  factory: {
    tipos: () => unwrap(window.api.factory.tipos()),
    create: (a) => unwrap(window.api.factory.create(a)),
    tree: (d) => unwrap(window.api.factory.tree(d)),
    read: (f) => unwrap(window.api.factory.read(f)),
    onEvent: (fn) => window.api.factory.onEvent(fn)
  },

  legal: {
    normativa: () => unwrap(window.api.legal.normativa()),
    analyzeUrl: (a) => unwrap(window.api.legal.analyzeUrl(a)),
    analyzeProject: (a) => unwrap(window.api.legal.analyzeProject(a)),
    analyzeText: (a) => unwrap(window.api.legal.analyzeText(a)),
    pickFile: () => unwrap(window.api.legal.pickFile())
  },

  github: {
    info: () => unwrap(window.api.github.info()),
    user: () => unwrap(window.api.github.user()),
    releases: () => unwrap(window.api.github.releases()),
    publish: (a) => unwrap(window.api.github.publish(a)),
    openRepo: () => window.api.github.openRepo()
  },

  update: {
    check: () => unwrap(window.api.update.check()),
    download: () => unwrap(window.api.update.download()),
    install: (d) => unwrap(window.api.update.install(d)),
    relaunch: () => window.api.update.relaunch(),
    onInfo: (fn) => window.api.update.onInfo(fn),
    onProgress: (fn) => window.api.update.onProgress(fn),
    onStatus: (fn) => window.api.update.onStatus(fn)
  },

  files: {
    save: (a) => unwrap(window.api.files.save(a)),
    open: () => unwrap(window.api.files.open())
  },

  onNavigate: (fn) => window.api.onNavigate(fn),
  onSettingsChanged: (fn) => window.api.onSettingsChanged(fn)
};

function dbCollection(name) {
  return {
    all: () => unwrap(window.api.db[name].all()),
    get: (id) => unwrap(window.api.db[name].get(id)),
    create: (item) => unwrap(window.api.db[name].create(item)),
    update: (id, patch) => unwrap(window.api.db[name].update(id, patch)),
    remove: (id) => unwrap(window.api.db[name].remove(id))
  };
}

/* ---------------------------- Utilidades ------------------------------ */
export const eur = (n, moneda = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda || 'EUR', maximumFractionDigits: 2 }).format(Number(n) || 0);

export const fecha = (iso) => {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (_) { return '-'; }
};

export const fechaHora = (iso) => {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return '-'; }
};

export const haceCuanto = (iso) => {
  if (!iso) return '-';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 2592000) return `hace ${Math.floor(s / 86400)} dias`;
  return fecha(iso);
};

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));