/**
 * IASolges.v2 - Proceso principal de Electron
 * Autor: Jose Manuel Bernabeu Mejias · MIT License
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const config = require('./config');
const db = require('./db');
const engine = require('./ai/engine');
const opencode = require('./ai/opencode');
const direct = require('./ai/direct');
const terminal = require('./terminal');
const customers = require('./customers');
const quotes = require('./quotes');
const factory = require('./factory');
const legal = require('./legal');
const github = require('./github');
const updater = require('./updater');
const { TITULAR, LICENCIA } = require('./titular');

let win = null;

const isDev = process.env.IASOLGES_DEV === '1';

function broadcast(channel, payload) {
  const targets = BrowserWindow.getAllWindows();
  for (const w of targets) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------ Ventana */
function createWindow() {
  const settings = config.getSettings();
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f8fa',
    title: 'IASolges.v2',
    icon: path.join(__dirname, '..', 'build', 'icons', '512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => {
    // La aplicacion se abre siempre maximizada
    if (process.env.IASOLGES_NO_MAXIMIZE !== '1') {
      try { win.maximize(); } catch (_) { /* ignore */ }
    }
    const vistaArg = process.argv.find((a) => a.startsWith('--vista='));
    if (vistaArg) {
      const vista = vistaArg.split('=')[1];
      win.webContents.once('did-finish-load', () => {
        win.webContents.executeJavaScript(`window.location.hash = '#/${vista}'`).catch(() => {});
      });
    }
    win.show();
  });

  if (isDev) {
    win.loadURL('http://localhost:5183');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Enlaces externos -> navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current && /^https?:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.on('closed', () => { win = null; });

  // Modo de prueba: registra errores del render y cierra solo
  if (process.env.IASOLGES_SMOKE) {
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${String(sourceId).split('/').pop()}:${line})`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[smoke] did-fail-load', code, desc));
    setTimeout(async () => {
      if (process.env.IASOLGES_ROUTE && win) {
        await win.webContents.executeJavaScript(`window.location.hash = '#/${process.env.IASOLGES_ROUTE}'`);
        await new Promise((r) => setTimeout(r, Number(process.env.IASOLGES_ROUTE_WAIT || 3500)));
      }
      if (process.env.IASOLGES_EVAL && win) {
        try {
          const res = await win.webContents.executeJavaScript(process.env.IASOLGES_EVAL);
          console.log('[smoke] eval =>', JSON.stringify(res)?.slice(0, 400));
        } catch (e) { console.error('[smoke] eval fallo:', e.message); }
        await new Promise((r) => setTimeout(r, Number(process.env.IASOLGES_EVAL_WAIT || 9000)));
      }
      console.log('[smoke] ventana cargada, informacion:', JSON.stringify(app.getVersion()));
      if (process.env.IASOLGES_SHOT && win) {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.IASOLGES_SHOT, img.toPNG());
          console.log('[smoke] captura guardada en', process.env.IASOLGES_SHOT);
        } catch (e) { console.error('[smoke] captura fallida', e.message); }
      }
      app.quit();
    }, 9000);
  }
  return win;
}

function buildMenu() {
  const template = [
    {
      label: 'IASolges.v2',
      submenu: [
        { label: 'Acerca de', click: () => dialog.showMessageBox(win, {
          type: 'info', title: 'IASolges.v2',
          message: `IASolges.v2 ${app.getVersion()}`,
          detail: `${TITULAR.nombre}\n${TITULAR.direccion}\n\nLicencia MIT\nRepositorio: ${settingsRepo()}`
        }) },
        { label: 'Credenciales del titular', click: () => broadcast('ui:navigate', { view: 'credenciales' }) },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Aplicacion',
      submenu: [
        { label: 'Inicio', accelerator: 'CmdOrCtrl+1', click: () => broadcast('ui:navigate', { view: 'inicio' }) },
        { label: 'Clientes (Mapa)', accelerator: 'CmdOrCtrl+2', click: () => broadcast('ui:navigate', { view: 'localizacion' }) },
        { label: 'Presupuestos', accelerator: 'CmdOrCtrl+3', click: () => broadcast('ui:navigate', { view: 'presupuestos' }) },
        { label: 'La Fabrica', accelerator: 'CmdOrCtrl+4', click: () => broadcast('ui:navigate', { view: 'fabrica' }) },
        { label: 'Analisis Legal', accelerator: 'CmdOrCtrl+5', click: () => broadcast('ui:navigate', { view: 'legal' }) },
        { label: 'Terminal IA', accelerator: 'CmdOrCtrl+6', click: () => broadcast('ui:navigate', { view: 'terminal' }) },
        { label: 'Configuracion', accelerator: 'CmdOrCtrl+,', click: () => broadcast('ui:navigate', { view: 'configuracion' }) },
        { type: 'separator' },
        { label: 'Actualizar desde GitHub', click: async () => {
          const r = await updater.check();
          broadcast('update:info', r);
          broadcast('ui:navigate', { view: 'configuracion' });
        } },
        { type: 'separator' },
        { label: 'Salir de la aplicacion', accelerator: 'CmdOrCtrl+Shift+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function settingsRepo() {
  const g = config.getSettings().github || {};
  return g.url || `https://github.com/${g.owner || 'JMBermejias'}/${g.repo || 'IASolgesv2'}`;
}

/* --------------------------------------------------------------------- IPC */
function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (_evt, ...args) => {
    try {
      const result = await fn(...args);
      return { ok: true, data: result };
    } catch (e) {
      console.error(`[ipc:${channel}]`, e);
      return { ok: false, error: e.message || String(e) };
    }
  });

  /* --- Aplicacion --- */
  handle('app:info', () => ({
    name: 'IASolges.v2',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${os.type()} ${os.release()}`,
    arch: process.arch,
    paths: {
      config: config.configDir, data: config.dataDir, projects: config.projectsDir,
      opencode: opencode.findBinary(), opencodeAuth: opencode.authFile()
    },
    settings: config.getSettings(),
    titular: TITULAR,
    licencia: LICENCIA,
    repo: settingsRepo()
  }));

  handle('app:exit', () => { app.quit(); return true; });
  handle('app:openExternal', (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); return true; });
  handle('app:openPath', (p) => shell.openPath(p));
  handle('app:showItem', (p) => { shell.showItemInFolder(p); return true; });
  handle('app:version', () => ({ app: app.getVersion(), opencode: opencode.version() }));

  /* --- Ajustes --- */
  handle('settings:get', () => config.getSettings());
  handle('settings:set', (patch) => {
    const merged = config.saveSettings(patch);
    if (patch?.apiKeys) opencode.syncCredentials(merged.apiKeys);
    broadcast('settings:changed', merged);
    return merged;
  });
  handle('settings:reset', () => {
    fs.writeFileSync(config.settingsPath, JSON.stringify(config.DEFAULT_SETTINGS, null, 2));
    config.saveSettings({});
    return config.getSettings();
  });
  handle('settings:openFolder', (which) => {
    const map = { config: config.configDir, data: config.dataDir, projects: config.projectsDir };
    shell.openPath(map[which] || config.dataDir);
    return map[which] || config.dataDir;
  });

  /* --- Credenciales del titular --- */
  handle('credentials:get', (_evt, revelar = false) => {
    const g = config.getSettings().github || {};
    return {
      titular: TITULAR,
      licencia: LICENCIA,
      github: { user: g.user, repo: g.repo, url: g.url, token: g.token ? `${g.token.slice(0, 7)}••••••••${g.token.slice(-4)}` : '', tokenCompleto: Boolean(g.token) },
      repositorio: settingsRepo()
    };
  });

  /* --- IA --- */
  handle('ai:catalog', () => engine.catalog());
  handle('ai:status', () => engine.status());
  handle('ai:opencodeModels', () => opencode.listModels());
  handle('ai:remoteModels', (provider) => direct.listRemoteModels(provider, config.getSettings().apiKeys?.[provider]));
  handle('ai:syncAuth', () => opencode.syncCredentials(config.getSettings().apiKeys || {}));
  handle('ai:complete', async (opts) => {
    const { text, sessionId } = await engine.complete(opts || {});
    return { text, sessionId };
  });
  handle('ai:run', async (opts) => {
    await engine.run({ ...opts, onEvent: (e) => broadcast('ai:event', { ...e, runId: opts.runId }) });
    return true;
  });
  handle('ai:cancel', (id) => engine.cancel(id));

  /* --- Terminal --- */
  handle('terminal:create', (opts) => terminal.create(opts || {}));
  handle('terminal:write', ({ id, data }) => terminal.write(id, data));
  handle('terminal:resize', ({ id, cols, rows }) => terminal.resize(id, cols, rows));
  handle('terminal:close', ({ id }) => terminal.close(id));
  handle('terminal:list', () => terminal.list());
  handle('terminal:cwd', (dir) => {
    const d = dir && fs.existsSync(dir) ? dir : config.projectsDir;
    return { cwd: d, files: fs.readdirSync(d).slice(0, 200) };
  });

  /* --- Clientes / mapa --- */
  handle('customers:categories', () => customers.CATEGORIES);
  handle('customers:geocode', (q) => customers.geocode(q));
  handle('customers:reverse', (lat, lon) => customers.reverse(lat, lon));
  handle('customers:search', (args) => customers.search(args));
  handle('customers:analysisPrompt', (args) => customers.buildAnalysisPrompt(args));
  handle('customers:save', (clientes, extra) => customers.saveSelected(clientes || [], extra || {}));

  /* --- Datos (dashboard, clientes, presupuestos, trabajos, analisis) --- */
  const collections = ['clientes', 'presupuestos', 'proyectos', 'trabajos', 'analyses'];
  for (const name of collections) {
    handle(`db:list:${name}`, () => db.collection(name));
    handle(`db:get:${name}`, (id) => db.find(name, id));
    handle(`db:insert:${name}`, (item) => db.insert(name, item));
    handle(`db:update:${name}`, ({ id, patch }) => db.update(name, id, patch));
    handle(`db:delete:${name}`, (id) => db.remove(name, id));
  }

  /* --- Presupuestos --- */
  handle('quotes:servicios', () => quotes.SERVICIOS);
  handle('quotes:generate', (args) => quotes.generar(args));
  handle('quotes:recalculate', (p) => quotes.calcular(p));
  handle('quotes:export', async ({ presupuesto, formato = 'html' }) => {
    const dir = path.join(config.dataDir, 'presupuestos');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${presupuesto.numero || 'presupuesto'}-${stamp}.${formato === 'md' ? 'md' : 'html'}`);
    const content = formato === 'md' ? renderMarkdown(presupuesto) : renderHtml(presupuesto);
    fs.writeFileSync(file, content, 'utf8');
    return { file, abrir: file };
  });

  /* --- Fabrica --- */
  handle('factory:tipos', () => factory.TIPOS);
  handle('factory:create', async (args) => {
    const streamTo = {
      emit: (evt, payload) => broadcast('factory:event', { ...payload, evt })
    };
    factory.create(args, streamTo);
    return true;
  });
  handle('factory:tree', (dir) => factory.listTree(dir));
  handle('factory:read', (file) => factory.readFileSafe(file));

  /* --- Analisis legal --- */
  handle('legal:normativa', () => legal.NORMATIVA);
  handle('legal:analyzeUrl', (args) => legal.analyze({ url: args.url, tipo: 'url', provider: args.provider, model: args.model, agent: args.agent }));
  handle('legal:analyzeProject', (args) => legal.analyzeProject({ projectId: args.projectId, dir: args.dir, provider: args.provider, model: args.model, agent: args.agent }));
  handle('legal:analyzeText', (args) => legal.analyze({ url: args.titulo || 'Documento ANALIZADO', tipo: 'documento', extraTexto: args.texto, provider: args.provider, model: args.model, agent: args.agent }));
  handle('legal:pickFile', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Selecciona el documento a analizar',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documentos', extensions: ['txt', 'md', 'html', 'htm', 'pdf', 'docx', 'csv', 'json', 'xml', 'log'] }, { name: 'Todos', extensions: ['*'] }]
    });
    if (res.canceled) return [];
    const out = [];
    for (const f of res.filePaths) {
      let texto = '';
      try {
        texto = fs.readFileSync(f, 'latin1');
        if (f.endsWith('.pdf') || f.endsWith('.docx')) {
          texto = `[Documento binario ${path.basename(f)}: ${fs.statSync(f).size} bytes. Revisa el resto del contexto]`;
        }
      } catch (e) { texto = `[No se pudo leer: ${e.message}]`; }
      out.push({ path: f, nombre: path.basename(f), size: fs.statSync(f).size, texto: texto.slice(0, 120000) });
    }
    return out;
  });

  /* --- GitHub --- */
  handle('github:info', () => github.repoInfo());
  handle('github:user', () => github.userInfo());
  handle('github:releases', () => github.listReleases());
  handle('github:publish', (args) => github.publishProject(args));
  handle('github:openRepo', () => { shell.openExternal(settingsRepo()); return true; });

  /* --- Actualizaciones --- */
  handle('update:check', () => updater.check());
  handle('update:download', async () => {
    const info = await updater.check();
    if (!info.latest?.asset) throw new Error('No hay paquete .deb disponible en la ultima release');
    const file = await updater.download(info.latest.asset.url);
    return { ...file, latest: info.latest };
  });
  handle('update:install', async (debPath) => {
    const res = await updater.install(debPath);
    if (res.ok) setTimeout(() => updater.relaunch(), 1200);
    return res;
  });
  handle('update:relaunch', () => { updater.relaunch(); return true; });

  /* --- Exportar trabajo (guardar como) --- */
  handle('file:save', async ({ name, content, filters }) => {
    const res = await dialog.showSaveDialog(win, { title: 'Guardar archivo', defaultPath: name, filters });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, content, 'utf8');
    return res.filePath;
  });
  handle('file:open', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Todos', extensions: ['*'] }] });
    if (res.canceled) return null;
    return { path: res.filePaths[0], nombre: path.basename(res.filePaths[0]), texto: fs.readFileSync(res.filePaths[0], 'utf8').slice(0, 200000) };
  });
}

function renderMarkdown(p) {
  const lines = [];
  lines.push(`# ${p.numero} · ${p.titulo}`);
  lines.push(`**Cliente:** ${p.cliente}`);
  lines.push(`**Fecha:** ${new Date(p.createdAt || Date.now()).toLocaleDateString('es-ES')}`);
  lines.push(`**Validez:** ${p.validezDias || 30} dias`);
  lines.push('');
  if (p.resumen) lines.push(`## Resumen\n${p.resumen}\n`);
  if (p.solucion) lines.push(`## Solucion propuesta\n${p.solucion}\n`);
  lines.push('## Partidas');
  lines.push('| Concepto | Horas | Precio/hora | Importe |');
  lines.push('|---|---|---|---|');
  for (const part of p.partidas) lines.push(`| ${part.concepto} | ${part.horas} | ${part.precioHora} ${p.moneda} | ${part.importe} ${p.moneda} |`);
  lines.push('');
  lines.push(`**Subtotal:** ${p.subtotal} ${p.moneda}`);
  if (p.descuentoImporte) lines.push(`**Descuento:** -${p.descuentoImporte} ${p.moneda}`);
  lines.push(`**Base imponible:** ${p.baseImponible} ${p.moneda}`);
  lines.push(`**IVA:** ${p.iva} ${p.moneda}`);
  lines.push(`**IRPF:** -${p.irpf} ${p.moneda}`);
  lines.push(`**TOTAL: ${p.total} ${p.moneda}**`);
  if (p.plazo) lines.push(`\n**Plazo:** ${p.plazo}`);
  if (p.formaPago) lines.push(`**Forma de pago:** ${p.formaPago}`);
  if (p.garantia) lines.push(`**Garantia:** ${p.garantia}`);
  if (p.incluye?.length) lines.push(`\n## Incluye\n${p.incluye.map((i) => `- ${i}`).join('\n')}`);
  if (p.noIncluye?.length) lines.push(`\n## No incluye\n${p.noIncluye.map((i) => `- ${i}`).join('\n')}`);
  if (p.condiciones?.length) lines.push(`\n## Condiciones\n${p.condiciones.map((i) => `- ${i}`).join('\n')}`);
  lines.push(`\n---\n${TITULAR.nombre} · ${TITULAR.direccion} · ${settingsRepo()}`);
  return lines.join('\n');
}

function renderHtml(p) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = p.partidas.map((x) => `<tr><td>${esc(x.concepto)}<br><small>${esc(x.descripcion)}</small></td><td>${x.horas}</td><td>${x.precioHora} ${esc(p.moneda)}</td><td>${x.importe} ${esc(p.moneda)}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.numero)} ${esc(p.titulo)}</title>
<style>body{font-family:system-ui,Arial;color:#111;margin:40px auto;max-width:900px}h1{color:#0f172a}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;font-size:14px}th{background:#f1f5f9}.tot{font-weight:700;font-size:18px}.foot{margin-top:40px;font-size:12px;color:#475569;border-top:1px solid #e2e8f0;padding-top:10px}</style></head><body>
<h1>${esc(p.numero)} · ${esc(p.titulo)}</h1>
<p><b>Cliente:</b> ${esc(p.cliente)}<br><b>Fecha:</b> ${new Date(p.createdAt || Date.now()).toLocaleDateString('es-ES')}<br><b>Validez:</b> ${p.validezDias || 30} dias</p>
<h2>Resumen</h2><p>${esc(p.resumen)}</p>
<h2>Partidas</h2><table><thead><tr><th>Concepto</th><th>Horas</th><th>Precio/hora</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table>
<p>Subtotal: ${p.subtotal} ${esc(p.moneda)}<br>${p.descuentoImporte ? `Descuento: -${p.descuentoImporte} ${esc(p.moneda)}<br>` : ''}Base imponible: ${p.baseImponible} ${esc(p.moneda)}<br>IVA: ${p.iva} ${esc(p.moneda)}<br>IRPF: -${p.irpf} ${esc(p.moneda)}</p>
<p class="tot">TOTAL: ${p.total} ${esc(p.moneda)}</p>
<p><b>Plazo:</b> ${esc(p.plazo)}<br><b>Pago:</b> ${esc(p.formaPago)}<br><b>Garantia:</b> ${esc(p.garantia)}</p>
<p class="foot">${esc(TITULAR.nombre)} · ${esc(TITULAR.direccion)} · ${esc(settingsRepo())} · Licencia MIT</p>
</body></html>`;
}

/* ------------------------------------------------------------------ Eventos */
terminal.bus.on('terminal:data', (p) => broadcast('terminal:data', p));
terminal.bus.on('terminal:close', (p) => broadcast('terminal:close', p));
terminal.bus.on('terminal:open', (p) => broadcast('terminal:open', p));
updater.bus.on('progress', (p) => broadcast('update:progress', p));
updater.bus.on('status', (p) => broadcast('update:status', p));

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  config.getSettings();
  db.load();
  registerIpc();
  buildMenu();
  createWindow();

  const settings = config.getSettings();
  if (settings.updates?.checkOnStart) {
    setTimeout(async () => {
      try {
        const info = await updater.check();
        broadcast('update:info', info);
      } catch (_) { /* silencioso */ }
    }, 4000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  terminal.killAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => terminal.killAll());

process.on('uncaughtException', (err) => console.error('[uncaught]', err));