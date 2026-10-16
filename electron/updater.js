/**
 * IASolges.v2 - Autoactualizacion desde GitHub Releases
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');
const { EventEmitter } = require('events');
const github = require('./github');

const bus = new EventEmitter();
bus.setMaxListeners(50);

function currentVersion() {
  try { return app.getVersion(); } catch (_) { return require('../package.json').version; }
}

function parseSemver(v) {
  const m = String(v || '0').replace(/^v/, '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(remote, local) {
  const r = parseSemver(remote);
  const l = parseSemver(local);
  for (let i = 0; i < 3; i += 1) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

function pickDeb(assets) {
  const debs = (assets || []).filter((a) => /\.deb$/i.test(a.name));
  if (!debs.length) return null;
  const arch = process.arch === 'arm64' ? /(arm64|aarch64)/i : /(amd64|x86_64)/i;
  return debs.find((a) => arch.test(a.name)) || debs[0];
}

/** Consulta la ultima release publicada */
async function check() {
  const releases = await github.listReleases();
  if (!releases.length) return { available: false, current: currentVersion(), releases: [], error: 'No hay releases publicadas todavia' };
  const latest = releases.find((r) => !r.prerelease) || releases[0];
  const asset = pickDeb(latest.assets);
  const available = isNewer(latest.tag, currentVersion());
  return {
    available: Boolean(available && asset),
    current: currentVersion(),
    latest: {
      tag: latest.tag,
      name: latest.name,
      notes: latest.notes,
      url: latest.url,
      publishedAt: latest.publishedAt,
      asset: asset ? { name: asset.name, size: asset.size, url: asset.url } : null
    },
    releases
  };
}

async function download(url, destDir = path.join(os.tmpdir(), 'iasolges-updates')) {
  fs.mkdirSync(destDir, { recursive: true });
  const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'update.deb';
  const dest = path.join(destDir, name);
  const res = await fetch(url, { headers: { 'User-Agent': 'IASolges.v2', Accept: 'application/octet-stream' } });
  if (!res.ok || !res.body) throw new Error(`Descarga fallida HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || 0);
  const out = fs.createWriteStream(dest);
  let received = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    bus.emit('progress', { received, total, percent: total ? Math.round((received / total) * 100) : null, dest });
    if (!out.write(value)) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((r) => out.end(r));
  return { dest, size: received };
}

/**
 * Instala el paquete .deb descargado.
 * Estrategia: pkexec + dpkg usando la regla de polkit instalada con el paquete
 * (permite actualizar sin escribir contrasena). Si no esta disponible, informa.
 */
function install(debPath) {
  return new Promise((resolve) => {
    const args = ['dpkg', '-i', debPath];
    const usePkexec = fs.existsSync('/usr/bin/pkexec');
    const cmd = usePkexec ? '/usr/bin/pkexec' : 'dpkg';
    const finalArgs = usePkexec ? args : ['-i', debPath];

    bus.emit('status', { message: usePkexec ? 'Instalando la nueva version (autenticacion requerida)...' : 'Instalando con dpkg...' });

    const child = spawn(cmd, finalArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', (e) => resolve({ ok: false, error: e.message, output: out }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: out });
      else resolve({ ok: false, error: `dpkg termino con código ${code}`, output: out });
    });
  });
}

function relaunch() {
  try {
    app.relaunch();
  } catch (_) { /* ignore */ }
  app.quit();
}

module.exports = { check, download, install, relaunch, isNewer, parseSemver, currentVersion, bus };