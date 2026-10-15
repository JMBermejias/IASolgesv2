/**
 * IASolges.v2 - La Fabrica: creacion de agentes, webs y aplicaciones con IA
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const engine = require('./ai/engine');
const db = require('./db');
const terminal = require('./terminal');
const github = require('./github');
const { getSettings, projectsDir } = require('./config');
const { SERVICIOS } = require('./quotes');

const TIPOS = [
  { id: 'web', label: 'Sitio web', icono: '🌐' },
  { id: 'tienda', label: 'Tienda online', icono: '🛒' },
  { id: 'app-web', label: 'Aplicacion web', icono: '💻' },
  { id: 'app-movil', label: 'Aplicacion movil', icono: '📱' },
  { id: 'agente', label: 'Agente de IA', icono: '🤖' },
  { id: 'automatizacion', label: 'Automatizacion', icono: '⚙️' },
  { id: 'dashboard', label: 'Panel de control', icono: '📊' },
  { id: 'api', label: 'API / microservicio', icono: '🔌' },
  { id: 'script', label: 'Script / herramienta', icono: '📜' }
];

function slugify(text) {
  return (text || 'proyecto')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'proyecto';
}

function uniqueDir(base) {
  let dir = base;
  let i = 2;
  while (fs.existsSync(dir)) {
    dir = `${base}-${i}`;
    i += 1;
  }
  return dir;
}

function buildPrompt({ proyecto, presupuesto, cliente, servicios, requisitos, tipo }) {
  const s = (id) => SERVICIOS.find((x) => x.id === id)?.label;
  const serviciosTxt = servicios.map(s).filter(Boolean).join(', ') || 'los servicios seleccionados';

  const presupuestoTxt = presupuesto
    ? `PRESUPUESTO APROBADO (referencia economica):
- Numero: ${presupuesto.numero} · ${presupuesto.titulo}
- Plazo: ${presupuesto.plazo || 'a definir'} · Pago: ${presupuesto.formaPago || ''}
- Partidas:
${presupuesto.partidas.map((p) => `  · ${p.concepto}: ${p.horas} h x ${p.precioHora} EUR/h = ${p.importe} EUR`).join('\n')}
- Total: ${presupuesto.total} EUR`
    : 'NO HAY PRESUPUESTO: el usuario ha pedido creacion libre. Aporta tu propio alcance tecnico.';

  const clienteTxt = cliente
    ? `CLIENTE:
- Nombre: ${cliente.nombre}
- Sector: ${cliente.categoria}
- Direccion: ${cliente.direccion}
- Contacto: ${cliente.contacto?.phone || 'n/d'} · ${cliente.contacto?.website || 'sin web'} · ${cliente.contacto?.email || 'sin email'}`
    : 'CLIENTE: no indicado (proyecto libre).';

  return `Trabaja como ingeniero de software senior yDiseñador de producto. Crea un proyecto COMPLETO, FUNCIONAL Y LISTO PARA PRODUCCION en el directorio actual.

OBJETIVO DEL PROYECTO:
${proyecto.descripcion || 'Aplicacion solicitada por el usuario'}

TIPO DE PRODUCTO: ${tipo}

${clienteTxt}

${presupuestoTxt}

SERVICIOS CONTRATADOS: ${serviciosTxt}

REQUISITOS EXPRESOS DEL USUARIO:
${requisitos || 'Ninguno adicional'}

REQUISITOS OBLIGATORIOS DEL PROYECTO:
1. La aplicacion DEBE incluir INTELIGENCIA ARTIFICIAL integrada de principio a fin (no un simple placeholder).
   - Implementa un modulo \`ai\` que soporte multiples proveedores (OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI) y tambien OpenCode.
   - Las claves se leen de variables de entorno o de un fichero \`.env.example\` que debes crear (nunca las escribas en el codigo).
   - Debe existir una configuracion por defecto razonable y un modo "mock" si no hay claves.
2. Interfaz de usuario profesional, responsive y accesible (contraste AA, navegacion por teclado, foco visible).
3. Validacion de entrada en servidor y cliente, gestion de errores y estados de carga.
4. Persistencia real (fichero JSON o SQLite) con esquema documentado.
5. Documentacion: README.md con instalacion, uso, arquitectura y variables de entorno.
6. Tests basicos (al menos un test por modulo principal) ejecutables con \`npm test\`.
7. Codigo limpio, comentado en espanol, sin credenciales ni secretos.
8. Variables de entorno de ejemplo y un script de arranque claro.

ENTREGA ESPERADA:
- Crea todos los ficheros necesarios en el directorio de trabajo actual.
- Instala/crea el \`package.json\` con los scripts \`start\`, \`dev\` y \`test\`.
- Ejecuta las pruebas si es viable y corrige los errores.
- Al finalizar imprime un resumen de lo creado.

Empieza a trabajar ahora sin preguntar, de forma autonoma y completa.`;
}

async function create(args, streamTo) {
  const settings = getSettings();
  const {
    nombre, descripcion = '', tipo = 'web', presupuestoId = null, clienteId = null,
    servicios = [], requisitos = '', provider, model, agent = 'build', autoLegal = true,
    pushToGithub = false
  } = args;

  const presupuesto = presupuestoId ? db.find('presupuestos', presupuestoId) : null;
  const cliente = clienteId ? db.find('clientes', clienteId) : (args.cliente || null);

  const baseName = slugify(`${nombre || descripcion.slice(0, 40) || tipo}`);
  const root = settings.factory?.rootFolder || projectsDir;
  fs.mkdirSync(root, { recursive: true });
  const dir = uniqueDir(path.join(root, baseName));
  fs.mkdirSync(dir, { recursive: true });

  const proyecto = db.insert('proyectos', {
    nombre: nombre || baseName,
    slug: path.basename(dir),
    carpeta: dir,
    tipo,
    descripcion,
    servicios,
    presupuestoId,
    clienteId,
    estado: 'creando',
    progreso: 0,
    log: [],
    ai: { provider: provider || settings.provider, model: model || settings.models?.[settings.provider], agent: agent || settings.agent },
    creadoPor: 'IASolges.v2'
  });

  const prompt = buildPrompt({ proyecto: { ...proyecto, descripcion }, presupuesto, cliente, servicios, requisitos, tipo });
  db.logEvent('fabrica_inicio', { proyecto: proyecto.id, dir });

  const bus = streamTo || new EventEmitter();
  const projectId = proyecto.id;
  let lastText = '';
  let buffer = '';

  const pushLog = (line, kind = 'info') => {
    const entry = { at: new Date().toISOString(), kind, text: String(line).slice(0, 4000) };
    const stored = db.find('proyectos', projectId);
    if (stored) {
      const log = [...(stored.log || []), entry].slice(-800);
      db.update('proyectos', projectId, { log });
    }
    bus.emit('event', { projectId, ...entry });
  };

  const onEvent = (evt) => {
    if (evt.type === 'status') { pushLog(evt.message, 'status'); bus.emit('event', { projectId, kind: 'status', text: evt.message }); return; }
    if (evt.type === 'token') {
      lastText += evt.text;
      buffer += evt.text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const l of lines) pushLog(l, 'out');
      bus.emit('event', { projectId, kind: 'token', text: evt.text });
      const stored = db.find('proyectos', projectId);
      if (stored) {
        const bar = Math.min(95, Math.round((stored.log?.length || 0) / 6));
        db.update('proyectos', projectId, { progreso: bar, salida: (stored.salida || '') + evt.text });
      }
      return;
    }
    if (evt.type === 'log' || evt.type === 'meta') { bus.emit('event', { projectId, kind: 'log', text: evt.text || JSON.stringify(evt.meta || {}) }); return; }
    if (evt.type === 'error') { pushLog(`ERROR: ${evt.message}`, 'error'); bus.emit('event', { projectId, kind: 'error', text: evt.message }); return; }
    if (evt.type === 'session') { db.update('proyectos', projectId, { sessionId: evt.sessionId }); return; }
    if (evt.type === 'end') {
      finish({ projectId, code: evt.code, bus, dir, presupuesto, cliente, autoLegal, pushToGithub, provider, model, agent, buffer, lastText });
    }
  };

  await engine.run({ prompt, cwd: dir, provider, model, agent, signalId: `fabrica_${projectId}`, onEvent, files: requisitos.includes('@archivo') ? [] : [] });

  return proyecto;
}

async function finish({ projectId, code, bus, dir, presupuesto, cliente, autoLegal, pushToGithub, provider, model, agent, buffer }) {
  if (buffer) db.update('proyectos', projectId, { log: [...(db.find('proyectos', projectId)?.log || []), { at: new Date().toISOString(), kind: 'out', text: buffer }] });

  bus.emit('event', { projectId, kind: 'status', text: 'Ejecucion finalizada. Preparando proyecto...' });

  // Git init + primer commit
  let git = null;
  try {
    terminal.exec('git init -q && git add -A && (git -c user.email=iasolges@local -c user.name="IASolges.v2" commit -q -m "Proyecto generado por IASolges.v2" || true)', { cwd: dir, timeout: 60000 });
    git = { inicializado: true, commit: terminal.exec('git rev-parse --short HEAD', { cwd: dir }).stdout.trim() };
  } catch (e) {
    git = { inicializado: false, error: e.message };
  }

  let githubInfo = null;
  if (pushToGithub) {
    try {
      githubInfo = await github.publishProject({ dir, nombre: db.find('proyectos', projectId)?.nombre || 'proyecto' });
    } catch (e) {
      githubInfo = { error: e.message };
    }
  }

  let legal = null;
  if (autoLegal) {
    try {
      const legalEngine = require('./legal');
      legal = await legalEngine.analyzeProject({ projectId, dir, provider, model, agent: 'plan' });
    } catch (e) {
      legal = { error: e.message };
    }
  }

  db.update('proyectos', projectId, {
    estado: code === 0 || code === null ? 'completado' : 'error',
    progreso: 100,
    finishedAt: new Date().toISOString(),
    git,
    github: githubInfo,
    legalId: legal?.id || null
  });

  const trabajo = db.insert('trabajos', {
    titulo: db.find('proyectos', projectId)?.nombre || 'Proyecto',
    tipo: 'creacion',
    proyectoId,
    presupuestoId: presupuesto?.id || null,
    clienteId: cliente?.id || null,
    estado: 'completado',
    detalle: `Proyecto generado en ${dir}`
  });

  bus.emit('event', { projectId, kind: 'done', text: 'Proyecto completado', git, github: githubInfo, legal: legal?.id || null });
  db.logEvent('fabrica_fin', { proyecto: projectId, code, trabajo: trabajo.id });
}

function listTree(dir, depth = 3) {
  const out = [];
  const walk = (current, level) => {
    if (level > depth) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(current, e.name);
      const rel = path.relative(dir, full);
      if (e.isDirectory()) {
        out.push({ path: rel, type: 'dir' });
        walk(full, level + 1);
      } else {
        let size = 0;
        try { size = fs.statSync(full).size; } catch (_) { size = 0; }
        out.push({ path: rel, type: 'file', size });
      }
    }
  };
  walk(dir, 0);
  return out;
}

function readFileSafe(file, maxBytes = 200000) {
  try {
    const st = fs.statSync(file);
    if (st.size > maxBytes) return { ok: false, error: 'Archivo demasiado grande' };
    return { ok: true, content: fs.readFileSync(file, 'utf8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { TIPOS, create, listTree, readFileSafe, buildPrompt, slugify };