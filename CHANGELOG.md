# Changelog

Todas las novedades de IASolges.v2.

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