# Changelog

Todas las novedades de IASolges.v2.

## [2.0.8] - 2026-10-16

### Corregido
- El botón **"Buscar clientes"** del panel de inicio volvía al inicio en lugar de abrir
  "Localización de clientes". La causa: los enlaces usaban la palabra acentuada
  (`localización`), el navegador la codificaba en el hash (`#/localizaci%C3%B3n`) y el
  enrutador no la reconocía. Ahora todas las rutas internas usan identificadores simples y el
  enrutador acepta indistintamente `localizacion`, `localización` o su versión codificada.
- El área de trabajo del buscador (mapa + listado) **se abre al instante** al pulsar Buscar,
  mostrando el progreso sobre el mapa, en lugar de esperar a que lleguen los datos.
- Si OpenStreetMap responde sin datos, se recurre a Nominatim antes de mostrar un vacío, y
  el mensaje distingue "no hay negocios" de "los servidores no han respondido".

## [2.0.7] - 2026-10-16

### Anadido
- **La Fábrica**: cuatro tipos de producto nuevos: 🖼️ Imágenes e ilustraciones, 🧊 Render 3D,
  🎬 Vídeo y animación y 🎧 Audio y música. Cada tipo activa instrucciones técnicas propias en el
  agente: motor de imágenes con variaciones, inpainting y modo MOCK; escena 3D generada desde texto
  con three.js y Blender en modo headless y exportación a PNG/OBJ/GLB/FBX; guion por escenas,
  storyboard, voz TTS, subtítulos SRT y montaje con MoviePy o FFmpeg; y texto a voz con mezcla de
  pistas para audio.
- Nuevos servicios presupuestables: Imágenes e ilustraciones con IA, Render 3D y modelado, y
  Vídeo y animación.
- Buscador de clientes: interruptor **"Incluir pequeñas empresas y autónomos"** (activo por defecto)
  que amplía las etiquetas buscadas a comercios, talleres, oficios, sanidad y locales de cualquier
  tipo, más un sector nuevo **"Pequeñas empresas y autónomos"**.

### Corregido
- El buscador ya no se queda solo con los negocios más conocidos: pide al servidor el doble de
  elementos del límite configurado, los ordena por cercanía, elimina duplicados y devuelve los más
  próximos hasta el número que indicas. En Novelda, con límite 60, pasa de 60 a 111 negocios detectados.
- Ortografía: más de 400 textos corregidos en toda la aplicación (ñ y tildes), entre ellos "Señal",
  "Cercanía geográfica", "Añade", "pequeña", "Análisis legal", "Configuración", "Auditoría",
  "Búsqueda", "Aplicación" y "automáticamente".

## [2.0.6] - 2026-10-16

### Anadido
- Buscador de clientes: control **"Máximo de clientes"** (de 10 a 300 resultados por búsqueda) con
  selección rápida 20 / 50 / 100 / 200 y aviso cuando hay más negocios de los pedidos.

## [2.0.5] - 2026-10-16

### Corregido
- La licencia MIT del repositorio usa el texto oficial en inglés con el nombre del titular, para que
  GitHub la identifique correctamente, y los datos completos quedan en el fichero `AUTHOR`.

## [2.0.4] - 2026-10-16

### Corregido
- La cabecera de la licencia MIT queda exactamente con el formato que GitHub reconoce, con el nombre y
  el domicilio del titular en el pie del fichero.

## [2.0.3] - 2026-10-16

### Corregido
- La licencia MIT del repositorio vuelve al texto oficial en ingles (con tu nombre y direccion) para que
  GitHub la identifique correctamente como MIT, y se muestra asi tambien dentro de la aplicacion.

## [2.0.2] - 2026-10-16

### Anadido
- La ventana se abre **maximizada** en todos los escritorios (se maximize despues de mostrarse,
  que es cuando el gestor de ventanas aplica correctamente el estado).
- `scripts/release.js`: publicacion completa de una release (version, commit, tag, push y `.deb`)
  con autenticacion mediante el token del titular, sin guardarlo en el remoto.

## [2.0.1] - 2026-10-15

### Anadido
- La aplicacion **se abre maximizada** al arrancar.
- Boton para **mostrar y copiar el token de GitHub** en el apartado Credenciales.
- `npm run release`: publica una nueva release (version, commit, tag, push y `.deb`) en un solo paso.

### Corregido
- Teselas del mapa sin clave de API (se usan las estandar de OpenStreetMap).
- Centro del mapa invalido al cambiar de ubicacion y estabilidad del listado de clientes.
- Procesamiento de JSON truncado en las respuestas de la IA (reintento de reparacion).

## [2.0.0] - 2026-10-15

### Anadido
- **Inicio**: dashboard con trabajos, clientes, presupuestos y accesos directos enlazados a cada elemento.
- **Localizacion de clientes**: busqueda en mapa (OpenStreetMap, Nominatim y Overpass) con filtros de
  sector y radio, ficha de cada negocio, porcentaje por medio de analisis (cercania, sector, presencia
  digital, oportunidad de digitalizacion, capacidad de inversion y densidad de mercado), probabilidad
  global de contratacion y analisis comercial con IA (segmentos, priorizacion, argumentarios y ofertas).
- **Presupuestos**: generacion automatica con IA a partir de clientes y necesidades, partidas con horas
  y precio/hora, descuento, base imponible, IVA, IRPF, total, plazo, forma de pago, garantia, condiciones
  y riesgos. Edicion manual, recalculo y exportacion a HTML y Markdown.
- **La Fabrica**: creacion de agentes, webs, tiendas, aplicaciones, APIs y scripts con IA integrada de
  principio a fin (con o sin presupuesto), con salida en vivo en un terminal dentro del area de trabajo,
  commit git, publicacion opcional en GitHub y analisis legal automatico del proyecto generado.
- **Analisis legal**: motor de comprobacion estatica (HTTPS, cookies y consentimiento, politica de
  privacidad, aviso legal, identificacion del titular, terminos, cabeceras de seguridad, accesibilidad,
  SEO, contenido mixto, secretos en el codigo) mas una revision profunda con IA, enlaces a la norma
  oficial, problema, impacto y solucion paso a paso. Permite analizar URLs, proyectos y documentos.
- **Terminal IA**: consola directa al proveedor de IA con agente y modelo configurables, historial, y
  shell real del sistema con PTY (bash con colores, git, npm, python…).
- **Configuracion**: once temas de color (blanco profesional por defecto), proveedores y modelos
  (OpenCode, OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI y Ollama),
  sincronizacion de credenciales con OpenCode, parametros economicos y repositorio de GitHub.
- **Autoactualizacion**: comprobacion de nuevas versiones en GitHub Releases, descarga del `.deb`,
  instalacion asistida y reinicio automatico.
- Boton **Salir** en el menu lateral, en la barra superior y en el menu del sistema.
- Boton **Volver al inicio** en todos los formularios.
- **Credenciales**: datos del titular, licencia MIT y acceso a GitHub.

### Seguridad
- Contexto aislado (`contextIsolation`), preload con `contextBridge` y sin acceso a Node desde la interfaz.
- Las claves de API se guardan en local y nunca se incrustan en el codigo generado por la IA.