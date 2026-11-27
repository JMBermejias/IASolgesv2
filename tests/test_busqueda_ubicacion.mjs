/**
 * IASolges.v2 - Regresion del buscador de clientes.
 *
 * Comprueba que al escribir otra ubicacion:
 *  1. se envia esa ubicacion (no la anterior),
 *  2. desaparecen los resultados antiguos mientras se busca,
 *  3. se muestran los nuevos,
 *  4. si la busqueda falla, el error queda en pantalla.
 *
 * Ejecutar: node tests/test_busqueda_ubicacion.mjs
 * Requiere jsdom en /tmp/iasolges-jsdom (IASOLGES_JSDOM para cambiar la ruta).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const cache = process.env.IASOLGES_JSDOM || `${process.env.TMPDIR || '/tmp'}/iasolges-jsdom`;
const { JSDOM } = createRequire(`${cache}/package.json`)('jsdom');

const asset = fs.readdirSync(path.join(ROOT, 'dist', 'assets'))
  .find((f) => f.startsWith('index-') && f.endsWith('.js'));
if (!asset) throw new Error('No hay bundle compilado: ejecuta npm run build');
const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'assets', asset), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');

let ok = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { ok++; console.log(`  \x1b[32mOK\x1b[0m   ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label}  ${extra}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const okRes = (data) => Promise.resolve({ ok: true, data });

const cliente = (nombre, lat, lon) => ({
  id: nombre, nombre, categoria: 'Comercios', direccion: `Calle de ${nombre}`,
  lat, lon, distanciaKm: 0.4, probabilidad: 60,
  contacto: { website: null, phone: null }, opciones: []
});
const resultado = (lugar, lat, lon) => ({
  center: { lat, lon, label: lugar },
  clientes: [cliente(`Negocio de ${lugar}`, lat, lon)],
  categoria: { id: 'todos', label: 'Todos los sectores' },
  total: 1, radio: 3, radioSolicitado: 3, limite: 150, motor: 'overpass',
  truncado: false, incluidosPequenos: true, sectorEstricto: false
});

const llamadas = [];
let respuesta = () => okRes(resultado('Novelda, Alicante', 38.3842, -0.7674));
let retraso = 0;
const buscador = (args) => {
  llamadas.push(args);
  const r = respuesta(args);
  return retraso ? r.then((v) => wait(retraso).then(() => v)) : r;
};

const dom = new JSDOM(html, {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
});
const w = dom.window;
w.api = {
  info: () => okRes({ version: '2.0.15' }),
  exit: () => okRes(true), openExternal: () => okRes(true), openPath: () => okRes(true),
  versions: () => okRes({}),
  settings: { get: () => okRes({ theme: 'claro', ui: {} }), set: (p) => okRes(p), reset: () => okRes({}), openFolder: () => okRes(true) },
  credentials: () => okRes({}),
  ai: { catalog: () => okRes({}), status: () => okRes({}), opencodeModels: () => okRes([]), remoteModels: () => okRes([]),
    syncAuth: () => okRes(true), complete: () => okRes(''), run: () => okRes(''), cancel: () => okRes(true),
    askJson: () => okRes({}), onEvent: () => () => {} },
  terminal: { create: () => okRes(1), write: () => {}, resize: () => {}, close: () => okRes(true), list: () => okRes([]),
    cwd: () => '', onData: () => () => {}, onClose: () => () => {}, onOpen: () => () => {} },
  customers: { categories: () => okRes([{ id: 'todos', label: 'Todos los sectores' }]),
    geocode: () => okRes([]), reverse: () => okRes(null), search: buscador,
    analysisPrompt: () => okRes(''), save: () => okRes([]) },
  db: { clientes: { all: () => okRes([]), remove: () => okRes(true) }, presupuestos: { all: () => okRes([]) },
    trabajos: { all: () => okRes([]) }, analisis: { all: () => okRes([]) } },
  update: { info: () => okRes(null), onInfo: () => () => {}, check: () => okRes(null), install: () => okRes(true) },
  onNavigate: () => () => {},
  github: { status: () => okRes({}), releases: () => okRes([]), publish: () => okRes({}) },
  legal: { analyze: () => okRes({}) }, factory: { create: () => okRes({}) }
};
w.console = { log() {}, warn() {}, error() {} };
w.eval(bundle);

const doc = w.document;
const $ = (s) => doc.querySelector(s);
const texto = () => doc.body.textContent;
const campo = () => [...doc.querySelectorAll('input[type=text]')]
  .find((i) => (i.placeholder || '').includes('Benidorm'));
const boton = () => [...doc.querySelectorAll('button')].find((b) => /Buscar/.test(b.textContent));
const escribir = (valor) => {
  const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
  setter.call(campo(), valor);
  campo().dispatchEvent(new w.Event('input', { bubbles: true }));
};
const pulsar = () => boton().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

console.log('\n=== 1. Primera busqueda (Novelda) ===');
await wait(2600);
w.location.hash = '#/localizacion';
w.dispatchEvent(new w.HashChangeEvent('hashchange'));
await wait(1600);
check('el buscador esta visible', !!campo() && !!boton());
pulsar();
await wait(500);
check('muestra los resultados de Novelda', texto().includes('Negocio de Novelda, Alicante'));

console.log('\n=== 2. Escribir otra ciudad ===');
escribir('Alicante');
await wait(300);
check('el campo acepta el texto nuevo', campo().value === 'Alicante', `valor=${campo().value}`);
respuesta = () => okRes(resultado('Alicante', 38.3436, -0.4881));
retraso = 1200;
pulsar();
await wait(250);
check('se envia la ubicacion escrita, no la anterior',
      llamadas.at(-1)?.query === 'Alicante', JSON.stringify(llamadas.at(-1)));
check('desaparecen los resultados viejos al empezar',
      !texto().includes('Negocio de Novelda, Alicante'));
check('se ve el estado de busqueda', texto().includes('Buscando clientes'));
await wait(1500);
check('salen los resultados de la nueva ciudad', texto().includes('Negocio de Alicante'));
check('no vuelven los de Novelda', !texto().includes('Negocio de Novelda, Alicante'));

console.log('\n=== 3. Cuando falla, se ve el error ===');
respuesta = () => Promise.reject(new Error('No se ha encontrado la ubicación "Elda"'));
retraso = 0;
pulsar();
await wait(500);
check('el error queda en pantalla', !!$('.alert.error'), $('.alert.error')?.textContent || '(ninguno)');
check('el error explica la ubicacion', texto().includes('No se ha encontrado la ubicación'));
check('no se queda el cursor girando sin fin', !texto().includes('Buscando clientes'));

console.log(`\n${'='.repeat(56)}\n  ${ok} correctos | ${fail} fallidos\n${'='.repeat(56)}\n`);
w.close();
process.exit(fail ? 1 : 0);
