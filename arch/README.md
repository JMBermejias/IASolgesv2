# IASolges.v2 para Arch Linux (AUR / yay)

Repositorio con el `PKGBUILD` de **IASolges.v2**, el agente inteligente para localizar clientes en el
mapa, crear presupuestos, generar software con IA (La Fábrica) y auditar legalmente los proyectos.

- Aplicación: https://github.com/JMBermejias/IASolgesv2
- Licencia: **MIT** — Jose Manuel Bernabeu Mejias
- Arquitectura: `x86_64`

## Instalar con yay

```bash
yay -G iasolges-v2 https://github.com/JMBermejias/iasolges-v2-arch.git
cd iasolges-v2
makepkg -si
```

o, en una sola línea:

```bash
yay -G iasolges-v2 https://github.com/JMBermejias/iasolges-v2-arch.git && cd iasolges-v2 && makepkg -si
```

## Instalar el paquete binario directamente

La release incluye el paquete ya construido:

```bash
sudo pacman -U iasolges-v2-2.0.14-x86_64.pkg.tar.zst
```

Descarga: https://github.com/JMBermejias/IASolgesv2/releases/download/v2.0.14/iasolges-v2-2.0.14-x86_64.pkg.tar.zst

## Ejecutar

```bash
iasolges-v2
```

La aplicación también aparece en el menú de aplicaciones como **IASolges.v2**.

## Dependencias

Se resuelven automáticamente: `gtk3`, `nss`, `alsa-lib`, `at-spi2-core`, `atk`, `cairo`, `cups-libs`,
`gdk-pixbuf2`, `glib2`, `libcap`, `libdrm`, `libnotify`, `libxcomposite`, `libxdamage`, `libxfixes`,
`libxkbcommon`, `libxrandr`, `libxrender`, `libxss`, `libxtst`, `mesa-libgbm`, `nspr` y `pango`.

Opcionales: `git` (publicar proyectos generados) y `python` (scripts auxiliares).

## Notas

- El paquete se reempaqueta a partir del `.deb` oficial publicado por el autor, de modo que la
  aplicación es exactamente la misma que en Debian/Ubuntu.
- Ubicación de los datos: `~/.config/IASolges.v2` y `~/.local/share/IASolges.v2`.
- OpenCode es opcional: si no lo tienes instalado, la aplicación funciona con el resto de
  proveedores de IA (OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI u Ollama).

## Mantenimiento

Actualizar `pkgver` en `PKGBUILD` y `.SRCINFO` cuando haya una nueva release del autor.