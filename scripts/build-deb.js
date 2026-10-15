#!/usr/bin/env node
/**
 * IASolges.v2 - Constructor del instalador .deb para Zorin OS / Ubuntu
 * Autor: Jose Manuel Bernabeu Mejias
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = pkg.version;
const ARCH = 'amd64';
const APP_NAME = 'IASolges.v2';
const PKG_NAME = 'iasolges-v2';
const UNPACKED = path.join(ROOT, 'dist-pkg', 'linux-unpacked');
const STAGE = path.join(ROOT, 'dist-pkg', 'deb-root');
const OUT_DIR = path.join(ROOT, 'dist-pkg');

const TITULAR = {
  nombre: 'Jose Manuel Bernabeu Mejias',
  email: 'jose.bernabeu.iasolges@gmail.com',
  direccion: 'Calle Medico Rafael Navarro 2, 2C, 03660 Novelda, Alicante, Espana'
};

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try { total += fs.statSync(p).size; } catch (_) { /* ignore */ }
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return Math.ceil(total / 1024);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  if (!fs.existsSync(UNPACKED)) {
    console.log('› electron-builder no ha generado linux-unpacked. Ejecutando...');
    run('npx electron-builder --linux dir --x64');
  }
  if (!fs.existsSync(UNPACKED)) {
    console.error('✖ No se encuentra dist-pkg/linux-unpacked. Ejecuta primero: npm run unpack');
    process.exit(1);
  }

  console.log('› Limpiando escenario...');
  fs.rmSync(STAGE, { recursive: true, force: true });
  const appDir = path.join(STAGE, 'opt', APP_NAME);
  fs.mkdirSync(appDir, { recursive: true });

  console.log('› Copiando la aplicacion a /opt ...');
  copyDir(UNPACKED, appDir);

  // resources/credentials.json (credenciales del titular, fuera del repositorio publico)
  const cred = path.join(ROOT, 'resources', 'credentials.json');
  const resDir = path.join(appDir, 'resources');
  fs.mkdirSync(resDir, { recursive: true });
  if (fs.existsSync(cred)) fs.copyFileSync(cred, path.join(resDir, 'credentials.json'));
  else fs.writeFileSync(path.join(resDir, 'credentials.json'), JSON.stringify({ github: { token: '' } }, null, 2));

  // Documentacion y licencia
  const docDir = path.join(STAGE, 'usr', 'share', 'doc', PKG_NAME);
  fs.mkdirSync(docDir, { recursive: true });
  for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(docDir, f));
  }

  // Lanzador en /usr/bin
  const binDir = path.join(STAGE, 'usr', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, PKG_NAME), `#!/bin/sh
# Lanzador de ${APP_NAME}
exec "/opt/${APP_NAME}/${PKG_NAME}" "$@"
`, { mode: 0o755 });

  // Entrada de menu
  const appsDir = path.join(STAGE, 'usr', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build', `${PKG_NAME}.desktop`), path.join(appsDir, `${PKG_NAME}.desktop`));

  // Metainfo (Software Center)
  const metaDir = path.join(STAGE, 'usr', 'share', 'metainfo');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build', `${PKG_NAME}.appdata.xml`), path.join(metaDir, `${PKG_NAME}.metainfo.xml`));

  // Iconos
  const iconRoot = path.join(ROOT, 'build', 'icons');
  if (fs.existsSync(iconRoot)) {
    for (const size of fs.readdirSync(iconRoot)) {
      const src = path.join(iconRoot, size, 'apps');
      if (!fs.existsSync(src)) continue;
      const dest = path.join(STAGE, 'usr', 'share', 'icons', 'hicolor', size, 'apps');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
    }
  }

  // Politica de polkit para la autoactualizacion
  const polkitDir = path.join(STAGE, 'usr', 'share', 'polkit-1', 'actions');
  fs.mkdirSync(polkitDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build', `${PKG_NAME}.policy`), path.join(polkitDir, `${PKG_NAME}.policy`));

  /* ---------------------------- DEBIAN ------------------------------- */
  const debian = path.join(STAGE, 'DEBIAN');
  fs.mkdirSync(debian, { recursive: true });

  const installedSize = dirSize(path.join(STAGE, 'opt'));
  const depends = (pkg.build.deb.depends || []).join(', ');

  const control = `Package: ${PKG_NAME}
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${installedSize}
Depends: ${depends}
Recommends: fonts-liberation
Maintainer: ${TITULAR.nombre} <${TITULAR.email}>
Homepage: https://github.com/JMBermejias/IASolgesv2
Description: ${APP_NAME} - agente inteligente de software con IA
 ${APP_NAME} integra inteligencia artificial en todas sus areas de trabajo:
 localizacion de clientes en mapa con analisis de probabilidad, presupuestos
 comerciales automaticos, La Fabrica para crear agentes, webs y aplicaciones
 completas, analisis legal y de cumplimiento con solucion de cada hallazgo,
 terminal con acceso directo al proveedor de IA (OpenCode y otros), temas
 multiples y autoactualizacion desde GitHub.
 .
 Destinatario: Jose Manuel Bernabeu Mejias, Novelda (Alicante).
 Licencia MIT.
`;
  fs.writeFileSync(path.join(debian, 'control'), control);

  fs.writeFileSync(path.join(debian, 'postinst'), `#!/bin/sh
set -e
echo "${APP_NAME} instalado correctamente."
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -qtf /usr/share/icons/hicolor || true
fi
if [ -x /opt/${APP_NAME}/${PKG_NAME} ]; then
  chmod 4755 /opt/${APP_NAME}/chrome-sandbox 2>/dev/null || true
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(path.join(debian, 'prerm'), `#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "upgrade" ]; then
  rm -rf "$HOME/.cache/${APP_NAME}" 2>/dev/null || true
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(path.join(debian, 'postrm'), `#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -qtf /usr/share/icons/hicolor || true
fi
if [ "$1" = "purge" ]; then
  rm -rf "$HOME/.config/${APP_NAME}" "$HOME/.local/share/${APP_NAME}" 2>/dev/null || true
fi
exit 0
`, { mode: 0o755 });

  // md5sums
  run(`cd "${STAGE}" && find opt us -type f ! -name md5sums -print0 | xargs -0 md5sum > DEBIAN/md5sums || true`);

  console.log('› Construyendo el paquete .deb...');
  const outFile = path.join(OUT_DIR, `${PKG_NAME}-${VERSION}-${ARCH}.deb`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  run(`dpkg-deb --root-owner-group --build "${STAGE}" "${outFile}"`);

  console.log(`\n✔ Paquete generado: ${outFile}`);
  run(`dpkg-deb --info "${outFile}" | head -20`);
  console.log(`\nInstalar con:  sudo apt install "${outFile}"`);
}

main();