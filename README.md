# IASolges.v2

**Agente inteligente para localizar clientes, presupuestar, crear software con IA y auditar legalmente todo lo que entregas.**

Aplicacion de escritorio para **Zorin OS 18 / Ubuntu 24.04 (noble) y derivados Linux**, instalada como paquete `.deb`.
Todo el trabajo ocurre **con inteligencia artificial integrada**, usando **OpenCode** como proveedor principal y
permitiendo anadir OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI u Ollama.

> Titular y autor: **Jose Manuel Bernabeu Mejias**
> Calle Medico Rafael Navarro 2, 2ºC, 03660 Novelda, Alicante, España
> Repositorio: https://github.com/JMBermejias/IASolgesv2 · Licencia **MIT**

---

## Indice

1. [Instalacion](#instalacion)
2. [Apartados de la aplicacion](#apartados-de-la-aplicacion)
3. [Proveedores y modelos de IA](#proveedores-y-modelos-de-ia)
4. [Como se construye el instalador](#como-se-construye-el-instalador)
5. [Estructura del proyecto](#estructura-del-proyecto)
6. [Datos y privacidad](#datos-y-privacidad)
7. [Licencia](#licencia)

---

## Instalacion

```bash
sudo apt install ./iasolges-v2-2.0.0-amd64.deb
```

Tambien puedes instalarlo con doble clic en el archivo `.deb` (Software Center / GDebi).

Tras la instalacion:

- La aplicacion aparece en el menu como **IASolges.v2**, genera su icono en el escritorio y **se abre maximizada**.
- Datos del usuario: `~/.config/IASolges.v2` (ajustes) y `~/.local/share/IASolges.v2` (clientes, presupuestos, proyectos, analisis).
- Proyectos generados: `~/.local/share/IASolges.v2/proyectos`.

Desinstalar: `sudo apt remove iasolges-v2` (o `purge` para borrar tambien los datos).

### Requisitos

- Zorin OS 18 / Ubuntu 24.04 o Derivados (Debian 12+ tambien funciona).
- Node.js y OpenCode son **opcionales**: solo hacen falta si quieres usar el proveedor OpenCode. La aplicacion
  funciona igualmente con el resto de proveedores mediante sus claves de API.

---

## Apartados de la aplicacion

Menu lateral plegable con los siguientes apartados:

| Apartado | Que hace |
|---|---|
| **Inicio** | Dashboard con los trabajos, clientes y presupuestos. Todos los elementos son enlaces directos a su apartado. |
| **Localizacion de clientes** | Busca negocios reales en el mapa (OpenStreetMap + Nominatim + Overpass), con filtros de sector y radio. De cada cliente devuelve sus datos, sus contactos y el **porcentaje por medio de analisis** (cercania, encaje de sector, presencia digital, oportunidad de digitalizacion, capacidad de inversion y densidad de mercado) con la probabilidad global de contratacion. Ademas, un **analisis comercial con IA** que segmenta, prioriza y propone argumentarios y ofertas. |
| **Presupuestos** | Genera presupuestos profesionales con IA a partir de los clientes elegidos y las necesidades: partidas con horas y precios, descuento, base imponible, IVA, IRPF, total, plazo, forma de pago, garantia, condiciones y riesgos. Editables y exportables a HTML/Markdown. |
| **La Fabrica** | Crea agentes, webs, tiendas, aplicaciones y cualquier proyecto que el cliente necesite (tambien **sin presupuesto**, en modo libre). Todo se genera **con IA integrada de principio a fin** y la creacion se ve **en vivo en un terminal** en el area de trabajo. Al terminar: commit git, publicacion opcional en GitHub y **analisis legal automatico** del codigo generado. |
| **Analisis legal** | Comprueba desde las cookies hasta el ultimo detalle: HTTPS, banner y consentimiento de cookies, politica de privacidad, aviso legal, identificacion del titular (CIF/NIF y domicilio), terminos y condiciones, cabeceras de seguridad, accesibilidad (RD 1112/2018), SEO, contenido mixto, secretos en el codigo y mucho mas. Cada hallazgo tiene un enlace que abre el **problema detectado, el impacto, la solucion paso a paso y la referencia normativa oficial**. Permite analizar tambien una URL, un proyecto generado o cualquier documento/texto suelto. |
| **Terminal IA** | Consola directa al proveedor de IA con el agente y modelo que tengas asignados, mas una **shell real del sistema** (bash con PTY) para git, npm, python… |
| **Configuracion** | Proveedores y modelos, credenciales de OpenCode, tema de color, parametros de presupuestos, repositorio de GitHub y actualizaciones. |
| **Credenciales** | Datos del titular, licencia MIT completa y acceso al repositorio y token de GitHub. |

Extras transversales:

- Boton **Salir** en el menu lateral, en la barra superior y en el menu del sistema.
- Todos los formularios incluyen el boton **Volver al inicio**.
- **Autoactualizacion**: al arrancar, la aplicacion consulta las releases de GitHub; si hay version nueva,
  muestra el boton de actualizacion, descarga el `.deb`, lo instala con `pkexec`+`dpkg` y se reinicia sola.

---

## Proveedores y modelos de IA

| Proveedor | Tipo | Clave |
|---|---|---|
| **OpenCode** (principal) | Motor con agentes y modelos proprios y agregados | Credenciales propias de OpenCode |
| OpenAI | Directo | `OPENAI_API_KEY` |
| Anthropic (Claude) | Directo | `ANTHROPIC_API_KEY` |
| Google Gemini | Directo | `GEMINI_API_KEY` |
| OpenRouter | Directo | `OPENROUTER_API_KEY` |
| Groq | Directo | `GROQ_API_KEY` |
| DeepSeek | Directo | `DEEPSEEK_API_KEY` |
| Mistral AI | Directo | `MISTRAL_API_KEY` |
| xAI (Grok) | Directo | `XAI_API_KEY` |
| Ollama | Local | no requiere clave |

Como funciona la integracion:

1. En **Configuracion > Proveedores y modelos** eliges proveedor y modelo por defecto (con selector desplegable
   de todos los modelos de ese proveedor).
2. Las claves se guardan en tu equipo y se **sincronizan automaticamente con OpenCode**
   (`~/.local/share/opencode/auth.json`), de forma que todos los modelos de OpenCode quedan disponibles.
3. El boton **Refrescar modelos** consulta en vivo la lista real de modelos (OpenCode o la API del proveedor).
4. Cada apartado usa el proveedor/modelo/agente seleccionado para su peticion.

---

## Como se construye el instalador

```bash
npm install            # dependencias
npm run icons          # genera los iconos hicolor
npm run build          # compila la interfaz (Vite -> dist/)
npm run unpack         # electron-builder -> dist-pkg/linux-unpacked
npm run deb            # assembla el .deb con dpkg-deb
# o todo de una vez:
npm run package
```

Desarrollo con recarga en caliente:

```bash
npm run dev
```

Publicar una **nueva release en GitHub** (version, commit, tag, push y subida del `.deb`) se hace con un solo comando:

```bash
npm run release -- "Descripcion del cambio" --bump patch   # 2.0.1 -> patch
npm run release -- "Descripcion" --bump minor               # 2.0.1 -> minor
```

El token se lee de `resources/credentials.json` (nunca versionado) o de la variable `GITHUB_TOKEN`.
**Regla del proyecto: cualquier cambio funcional se publica siempre como una nueva release**, de modo que la
autoactualizacion de la aplicacion detecte la version nueva.

El paquete `.deb` se ensambla en `dist-pkg/iasolges-v2-<version>-amd64.deb` e incluye:

- `/opt/IASolges.v2/` — la aplicacion completa (Electron + interfaz + logica).
- `/usr/bin/iasolges-v2` — lanzador.
- `/usr/share/applications/iasolges-v2.desktop` — entrada de menu.
- `/usr/share/icons/hicolor/*/apps/iasolges-v2.png` — iconos en todos los tamanos.
- `/usr/share/metainfo/iasolges-v2.metainfo.xml` — ficha para el Software Center.
- `/usr/share/polkit-1/actions/iasolges-v2.policy` — politica para la autoactualizacion.
- `/usr/share/doc/iasolges-v2/` — README, LICENSE y CHANGELOG.

---

## Estructura del proyecto

```
IASolges.v2/
├── electron/                 Proceso principal (Node/Electron)
│   ├── main.js               Ventana, menu, IPC, actualizaciones
│   ├── preload.js            Puente seguro contextBridge
│   ├── config.js             Ajustes y rutas (XDG)
│   ├── db.js                 Almacenamiento JSON (clientes, presupuestos, proyectos, analisis)
│   ├── ai/
│   │   ├── engine.js         Motor unificado + reparacion de JSON
│   │   ├── providers.js      Catalogo de proveedores y modelos
│   │   ├── opencode.js       Puente con el CLI de OpenCode (streaming, sesiones, credenciales)
│   │   └── direct.js         Clientes HTTP por streaming (OpenAI, Anthropic, Gemini…)
│   ├── customers.js          Localizacion por mapa y analisis de probabilidades
│   ├── quotes.js             Presupuestos con IA (IVA, IRPF, margen)
│   ├── factory.js            La Fabrica (creacion de proyectos + terminal)
│   ├── legal.js              Motor de analisis legal (estatico + IA)
│   ├── terminal.js           Terminal con PTY y ejecucion de comandos
│   ├── github.js             Publicacion en GitHub y releases
│   ├── updater.js            Autoactualizacion desde GitHub Releases
│   └── titular.js            Titular y licencia
├── src/                      Interfaz React
│   ├── App.jsx               Layout, navegacion y rutas
│   ├── components/           Sidebar, Topbar, mapa, terminal, avisos
│   ├── views/                Inicio, Localizacion, Presupuestos, Fabrica, Legal, Terminal, Configuracion, Credenciales
│   ├── lib/                  Cliente IPC y componentes de interfaz
│   └── styles/app.css        Sistema de diseno y 11 temas de color
├── build/                    Iconos, .desktop, appdata, polkit
├── scripts/                  Constructor del .deb, iconos, release
└── dist-pkg/                 Salida de compilacion (.deb)
```

---

## Datos y privacidad

- Todos los datos se guardan **en local**: `~/.config/IASolges.v2` y `~/.local/share/IASolges.v2`.
- No se enviea informacion a ningun servidor propio: el unico trafico externo son las APIs de los
  proveedores de IA que configures y los servicios publicos de OpenStreetMap (Nominatim/Overpass).
- Las claves de API nunca se escriben en los proyectos generados: se exportan como `.env.example`.
- `resources/credentials.json` contiene las credenciales del titular y esta en `.gitignore`: no se publica
  en el repositorio, aunque si se incrusta en el paquete `.deb` de tu equipo.

---

## Licencia

**MIT** · Copyright (c) 2026 **Jose Manuel Bernabeu Mejias**, Calle Medico Rafael Navarro 2, 2ºC,
03660 Novelda, Alicante, España. Consulta [LICENSE](LICENSE) (texto oficial de la licencia MIT) y [AUTHOR](AUTHOR).