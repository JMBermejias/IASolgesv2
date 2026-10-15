#!/usr/bin/env node
/**
 * IASolges.v2 - Publicacion automatica de una nueva release en GitHub
 *
 * Uso:  npm run release -- "Mensaje de la release" [--bump patch|minor|major] [--skip-build]
 *
 * Pasos: version bump -> build -> electron-builder -> .deb -> commit -> tag -> push -> release
 * El token se toma de resources/credentials.json (nunca versionado).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const mensaje = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--bump') || 'Actualizacion de IASolges.v2';
const bump = flag('bump', 'patch');
const skipBuild = args.includes('--skip-build');
const sinPush = args.includes('--no-push');

function sh(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function credentials() {
  const p = path.join(ROOT, 'resources', 'credentials.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

function bumpVersion(tipo) {
  const [a, b, c] = pkg.version.split('.').map(Number);
  const nuevo = tipo === 'major' ? `${a + 1}.0.0` : tipo === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
  pkg.version = nuevo;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return nuevo;
}

function api(pathname, { method = 'GET', body, raw = false, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: pathname,
      method,
      headers: {
        'User-Agent': 'IASolges.v2',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) return reject(new Error(`GitHub ${res.statusCode}: ${texto.slice(0, 300)}`));
        if (raw) return resolve({ buffer: Buffer.concat(chunks) });
        try { resolve(texto ? JSON.parse(texto) : null); } catch (_) { resolve(texto); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(releaseId, filePath, token) {
  return new Promise((resolve, reject) => {
    const name = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    const req = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      method: 'POST',
      headers: {
        'User-Agent': 'IASolges.v2',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) return reject(new Error(`Subida ${res.statusCode}: ${texto.slice(0, 200)}`));
        resolve(JSON.parse(texto));
      });
    });
    req.on('error', reject);
    req.write(content);
    req.end();
  });
}

(async () => {
  const creds = credentials();
  const token = creds.github?.token || process.env.GITHUB_TOKEN;
  const repoCfg = creds.github?.repo || 'JMBermejias/IASolgesv2';
  const [owner, repo] = repoCfg.split('/');
  if (!token) {
    console.error('✖ Falta el token de GitHub (resources/credentials.json o GITHUB_TOKEN).');
    process.exit(1);
  }

  const version = bumpVersion(bump);
  const tag = `v${version}`;
  console.log(`\n▶ Nueva version: ${version} (${tag})`);

  if (!skipBuild) {
    sh('npm run build');
    sh('npx electron-builder --linux dir --x64');
    sh('node scripts/build-deb.js');
  }
  const deb = path.join(ROOT, 'dist-pkg', `iasolges-v2-${version}-amd64.deb`);
  if (!fs.existsSync(deb)) {
    console.error(`✖ No existe el paquete ${deb}`);
    process.exit(1);
  }

  // Git
  sh('git add -A');
  const hayCambios = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT }).status !== 0;
  if (hayCambios) sh(`git commit -m "${mensaje.replace(/"/g, "'")}"`);
  sh(`git tag -f ${tag} -m "${mensaje.replace(/"/g, "'")}" || true`);

  if (!sinPush) {
    sh('git push origin main');
    sh(`git push origin ${tag} --force`);
  }

  // Release
  const notas = `## IASolges.v2 ${version}

${mensaje}

### Instalacion
\`\`\`bash
sudo apt install ./iasolges-v2-${version}-amd64.deb
\`\`\`

La aplicacion comprueba automaticamente las releases de este repositorio y
ofrece la actualizacion con un boton, descargando el paquete .deb, instalandolo
y reiniciandose.

Licencia **MIT** - Jose Manuel Bernabeu Mejias, Calle Medico Rafael Navarro 2, 2ºC, 03660 Novelda, Alicante, España.`;

  try {
    await api(`/repos/${owner}/${repo}/releases/tags/${tag}`, { token });
    console.log('· La release ya existe: se actualizan sus datos y su paquete');
    const existente = await api(`/repos/${owner}/${repo}/releases/tags/${tag}`, { token });
    const asset = (existente.assets || []).find((a) => a.name === path.basename(deb));
    if (asset) await api(`/repos/${owner}/${repo}/releases/assets/${asset.id}`, { method: 'DELETE', token });
    await api(`/repos/${owner}/${repo}/releases/${existente.id}`, {
      method: 'PATCH', token, body: { tag_name: tag, name: `IASolges.v2 ${version}`, body: notas }
    });
    const actualizada = await api(`/repos/${owner}/${repo}/releases/tags/${tag}`, { token });
    const subida = await uploadAsset(actualizada.id, deb, token);
    console.log(`✔ Release actualizada: ${subida.browser_download_url}`);
  } catch (e) {
    if (!String(e.message).includes('Not Found')) throw e;
    const creada = await api(`/repos/${owner}/${repo}/releases`, {
      method: 'POST', token, body: { tag_name: tag, name: `IASolges.v2 ${version}`, body: notas, draft: false, prerelease: false }
    });
    const subida = await uploadAsset(creada.id, deb, token);
    console.log(`✔ Release creada: ${subida.browser_download_url}`);
  }

  console.log(`\n▶ Publicada la version ${version}. La aplicacion ya la detectara como actualizacion.`);
})().catch((e) => {
  console.error('✖ Error publicando la release:', e.message);
  process.exit(1);
});