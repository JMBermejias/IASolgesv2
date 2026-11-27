/**
 * IASolges.v2 - El chequeo de actualizaciones no debe depender de un token valido
 * cuando el repositorio es publico. Ejecutar: node tests/test_github_updates.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iasolges-gh-'));
process.env.XDG_CONFIG_HOME = path.join(tmp, 'config');
process.env.XDG_DATA_HOME = path.join(tmp, 'data');
const dataDir = path.join(process.env.XDG_DATA_HOME, 'IASolges.v2');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'credentials.json'), JSON.stringify({
  github: { token: 'token-caducado', repo: 'JMBermejias/IASolgesv2' }
}));

let releases = [{
  tag_name: 'v2.0.16',
  name: '2.0.16',
  published_at: '2026-11-27T00:00:00Z',
  prerelease: false,
  body: 'Correcciones',
  html_url: 'https://github.com/JMBermejias/IASolgesv2/releases/tag/v2.0.16',
  assets: [{ name: 'iasolges-v2-2.0.16-amd64.deb', size: 100, id: 1, browser_download_url: 'https://example.org/app.deb' }]
}];

let calls = [];
global.fetch = async (url, opts = {}) => {
  const headers = opts.headers || {};
  calls.push({ url, withToken: Boolean(headers.Authorization) });
  if (headers.Authorization && !String(headers.Authorization).includes('token-valido')) {
    return { ok: false, status: 401, text: async () => JSON.stringify({ message: 'Bad credentials' }) };
  }
  return { ok: true, status: 200, text: async () => JSON.stringify(releases) };
};

const config = require('../electron/config');
const github = require('../electron/github');
const updater = require('../electron/updater');

let ok = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { ok++; console.log(`  \x1b[32mOK\x1b[0m   ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label}  ${extra}`); }
};

(async () => {
  console.log('\n=== Releases con token caducado ===');
  calls = [];
  const liste = await github.listReleases();
  check('devuelve el release aunque el token este caducado', liste.length === 1 && liste[0].tag === 'v2.0.16', JSON.stringify(liste));
  check('intenta con token y luego sin token', calls.length === 2 && calls[0].withToken && !calls[1].withToken, JSON.stringify(calls));

  console.log('\n=== Releases con token valido ===');
  config.saveSettings({ github: { token: 'token-valido' } });
  calls = [];
  const liste2 = await github.listReleases();
  check('con token valido no hace una segunda peticion', calls.length === 1 && calls[0].withToken, JSON.stringify(calls));
  check('devuelve el release con token valido', liste2.length === 1 && liste2[0].tag === 'v2.0.16', JSON.stringify(liste2));

  console.log('\n=== Comprobacion de actualizacion con token caducado ===');
  config.saveSettings({ github: { token: 'token-caducado' } });
  releases = [Object.assign({}, releases[0], { tag_name: 'v2.1.0', name: '2.1.0' })];
  calls = [];
  // La version instalada se lee de package.json cuando no hay app de Electron.
  const info = await updater.check();
  check('detecta la version publicada con token caducado',
    info && info.latest && info.latest.tag === 'v2.1.0' && info.available === true,
    JSON.stringify(info));
  check('la comprobacion consulta GitHub dos veces (con y sin token)',
    calls.length === 2 && calls[0].withToken && !calls[1].withToken, JSON.stringify(calls));

  console.log(`\n${'='.repeat(52)}\n  ${ok} correctos | ${fail} fallidos\n${'='.repeat(52)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
