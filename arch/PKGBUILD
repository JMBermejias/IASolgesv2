# Maintainer: Jose Manuel Bernabeu Mejias <jose.bernabeu.iasolges@gmail.com>
# PKGBUILD de IASolges.v2 para Arch Linux (AUR / yay)
#
#   yay -S iasolges-v2
#   o bien, desde el repositorio oficial del autor:
#   yay -G iasolges-v2 https://github.com/JMBermejias/iasolges-v2-arch.git && cd iasolges-v2 && makepkg -si
#
pkgname=iasolges-v2
pkgver=2.0.14
pkgrel=1
pkgdesc="Agente inteligente para localizar clientes en el mapa, crear presupuestos, generar software con IA (La Fabrica) y auditar legalmente los proyectos."
arch=('x86_64')
url="https://github.com/JMBermejias/IASolgesv2"
license=('MIT')
makedepends=('zstd')
depends=(
  'alsa-lib'
  'at-spi2-core'
  'atk'
  'cairo'
  'cups-libs'
  'expat'
  'gdk-pixbuf2'
  'glib2'
  'gtk3'
  'libcap'
  'libdrm'
  'libnotify'
  'libxcomposite'
  'libxdamage'
  'libxfixes'
  'libxkbcommon'
  'libxrandr'
  'libxrender'
  'libxss'
  'libxtst'
  'mesa-libgbm'
  'nspr'
  'nss'
  'pango'
)
optdepends=(
  'git: publicacion de proyectos generados en repositorios'
  'python: scripts auxiliares e informes'
)
provides=("$pkgname=$pkgver")
conflicts=('iasolges')
options=('!strip')
source=("$pkgname-$pkgver-amd64.deb"::"https://github.com/JMBermejias/IASolgesv2/releases/download/v$pkgver/iasolges-v2-$pkgver-amd64.deb")
sha256sums=('SKIP')

package() {
  local installdir="/opt/IASolges.v2"
  local payload="$srcdir/payload"
  mkdir -p "$payload"

  # El paquete oficial es un .deb de Debian: se extrae su contenido.
  case "$(ls "$srcdir" | grep '^data\.tar' | head -n1)" in
    data.tar.xz) bsdtar -xf "$srcdir/data.tar.xz" -C "$payload" ;;
    data.tar.zst) bsdtar -xf "$srcdir/data.tar.zst" -C "$payload" ;;
    data.tar.gz) bsdtar -xf "$srcdir/data.tar.gz" -C "$payload" ;;
    *) echo "No se encuentra data.tar* en el paquete" >&2; return 1 ;;
  esac

  # Aplicacion
  install -d "$pkgdir$installdir"
  cp -a "$payload/opt/IASolges.v2/." "$pkgdir$installdir/"

  # Lanzador
  install -d "$pkgdir/usr/bin"
  ln -sf "$installdir/iasolges-v2" "$pkgdir/usr/bin/iasolges-v2"

  # Entrada de menu, metainfo e iconos
  install -Dm644 "$payload/usr/share/applications/iasolges-v2.desktop" \
    "$pkgdir/usr/share/applications/iasolges-v2.desktop"
  install -Dm644 "$payload/usr/share/metainfo/iasolges-v2.metainfo.xml" \
    "$pkgdir/usr/share/metainfo/iasolges-v2.metainfo.xml"
  cp -a "$payload/usr/share/icons/." "$pkgdir/usr/share/icons/"

  # Documentacion y licencia
  install -Dm644 "$payload/usr/share/doc/iasolges-v2/LICENSE" \
    "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  install -Dm644 "$payload/usr/share/doc/iasolges-v2/README.md" \
    "$pkgdir/usr/share/doc/$pkgname/README.md"

  # Sandbox de Chromium (necesario sin --no-sandbox)
  chmod 4755 "$pkgdir$installdir/chrome-sandbox" 2>/dev/null || true
}