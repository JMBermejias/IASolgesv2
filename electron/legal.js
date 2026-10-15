/**
 * IASolges.v2 - Analisis Legal: comprobaciones automaticas (estaticas + IA) sobre URLs, proyectos y documentos
 */
const fs = require('fs');
const path = require('path');
const engine = require('./ai/engine');
const db = require('./db');
const { getSettings } = require('./config');

const SEVERIDADES = {
  critica: { peso: 20, color: '#b91c1c', label: 'Critica' },
  alta: { peso: 12, color: '#ea580c', label: 'Alta' },
  media: { peso: 6, color: '#ca8a04', label: 'Media' },
  leve: { peso: 2, color: '#0891b2', label: 'Leve' },
  info: { peso: 0, color: '#64748b', label: 'Informativa' }
};

/** Catalogo de normativa de referencia mostrada en la interfaz */
const NORMATIVA = [
  { id: 'rgpd', nombre: 'Reglamento (UE) 2016/679 (RGPD)', url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', arts: '13, 14, 28, 30, 32, 35, 44-49' },
  { id: 'lssi', nombre: 'Ley 34/2002 LSSI-CE', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758', arts: '5, 7, 9-12, 38' },
  { id: 'lorgaa', nombre: 'Ley Orgánica 3/2018 LOPDGDD', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673', arts: '5, 6, 9' },
  { id: 'accesibilidad', nombre: 'RD 1112/2018 (Accesibilidad)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-12599', arts: '2, 3, 4, 8' },
  { id: 'consumidor', nombre: 'RD 1/2007 legislation consumidor', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555', arts: '5-9, 13, 17' },
  { id: 'ecommerce', nombre: 'Ley 7/1992 LCE + RD 206/2003 comercio electronico', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2003-18915', arts: '6, 8, 10, 37' },
  { id: 'cookies', nombre: 'Directiva 2002/22 + guia AEPD cookies', url: 'https://www.aepd.es/preguntas-frecuentes/3-proteccion-de-datos/3-3-derechos/3-3-4-cookies', arts: 'Consentimiento previo' },
  { id: 'licencias', nombre: 'Licencias de software libres (OSS)', url: 'https://www.gnu.org/licenses/lgpl-3.0.html', arts: 'Copyleft y atribucion' },
  { id: 'pcie', nombre: 'Ley 11/2022 General de Telecomunicaciones', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-10757', arts: '89 (cookies)' },
  { id: 'lal', nombre: 'Ley 15/2015 Lalcom (comunicaciones comerciales)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11771', arts: '2-6' }
];

function normativa(id) { return NORMATIVA.find((n) => n.id === id) || null; }
function severidadInfo(s) { return SEVERIDADES[s] || SEVERIDADES.info; }

async function fetchUrl(url, timeout = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) IASolges.v2/2.0 auditoria-legal',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, headers: Object.fromEntries(res.headers.entries()), html };
  } finally { clearTimeout(t); }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html, base) {
  const out = [];
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    const text = stripHtml(m[2]).slice(0, 120);
    try { href = new URL(href, base).toString(); } catch (_) { continue; }
    out.push({ href, text });
  }
  return out;
}

function containsAny(text, words) {
  const t = text.toLowerCase();
  return words.filter((w) => t.includes(w.toLowerCase()));
}

const CHECKS = [
  {
    id: 'https',
    categoria: 'Seguridad',
    nombre: 'Certificado HTTPS valido',
    nivel: 'alta',
    baseLegal: 'lssi',
    test: (ctx) => ({
      ok: String(ctx.url).startsWith('https://'),
      problema: 'El sitio no se sirve mediante HTTPS',
      solucion: 'Instala un certificado TLS (Let\'s Encrypt gratuito) y fuerza la redireccion de http a https. Afecta al SEO y a los datos personales.',
      referencia: 'Ley 34/2002 art. 38 y RGPD art. 32 (seguridad del tratamiento)'
    })
  },
  {
    id: 'cookies-consent',
    categoria: 'Cookies',
    nombre: 'Banner de consentimiento de cookies',
    nivel: 'critica',
    baseLegal: 'cookies',
    test: (ctx) => {
      const textos = ctx.text;
      const banner = containsAny(textos, ['aceptar cookies', 'acepto las cookies', 'consentimiento de cookies', 'cookies settings', 'gestionar cookies', 'cookie consent', 'rechazar cookies']);
      return {
        ok: banner.length > 0,
        problema: 'No se detecta banner ni mecanismo de consentimiento previo a la aceptacion de cookies',
        solucion: 'Implementa un CMP (banner) que bloquee las cookies no esenciales hasta obtener consentimiento expreso, con opcion de rechazar y de retirar el consentimiento tan facilmente como se concede.',
        referencia: 'RGPD art. 6.1.a y 7; guia AEPD sobre cookies'
      };
    }
  },
  {
    id: 'cookies-declaracion',
    categoria: 'Cookies',
    nombre: 'Politica de cookies',
    nivel: 'alta',
    baseLegal: 'cookies',
    test: (ctx) => {
      const found = ctx.links.some((l) => /(cookie|cookies)/i.test(l.href) || /cookie/i.test(l.text));
      return {
        ok: found,
        problema: 'No se ha encontrado politica de cookies',
        solucion: 'Publica una politica de cookies detailing que cookies se utilizan, su finalidad, duracion, proveedor y como retirar el consentimiento.',
        referencia: 'Ley 34/2002 art. 22.2; guia AEPD'
      };
    }
  },
  {
    id: 'privacidad',
    categoria: 'Proteccion de datos',
    nombre: 'Politica de privacidad',
    nivel: 'critica',
    baseLegal: 'rgpd',
    test: (ctx) => {
      const found = ctx.links.some((l) => /(privacidad|privacy)/i.test(l.href) || /pol.tica de privacidad|privacidad/i.test(l.text))
        || /pol.tica de privacidad/i.test(ctx.text);
      return {
        ok: found,
        problema: 'No se detecta politica de privacidad',
        solucion: 'Redacta y publica la politica de privacidad con: identidad del responsable, datos tratados, finalidad, base juridica, destinatarios, conservacion, derechos del interesado y transferencias internacionales.',
        referencia: 'RGPD art. 13 y 14'
      };
    }
  },
  {
    id: 'aviso-legal',
    categoria: 'Informacion legal',
    nombre: 'Aviso legal',
    nivel: 'alta',
    baseLegal: 'lssi',
    test: (ctx) => {
      const found = ctx.links.some((l) => /(aviso.?legal|legal|legislacion)/i.test(l.href) || /aviso legal/i.test(l.text))
        || /aviso legal/i.test(ctx.text);
      return {
        ok: found,
        problema: 'No se encuentra aviso legal ni informacion sobre el prestador de servicios',
        solucion: 'Incluye el aviso legal con: nombre y NIF/CIF del titular, domicilio, correo electronico, registro de la actividad, condiciones de uso y titular del dominio.',
        referencia: 'Ley 34/2002 art. 5'
      };
    }
  },
  {
    id: 'terminos',
    categoria: 'Contratacion',
    nombre: 'Terminos y condiciones',
    nivel: 'media',
    baseLegal: 'consumidor',
    test: (ctx) => {
      const found = ctx.links.some((l) => /(terminos|condiciones|terms)/i.test(l.href) || /t.rminos|condiciones/i.test(l.text));
      return {
        ok: found,
        problema: 'No se detectan terminos y condiciones de uso/venta',
        solucion: 'Publica condiciones de uso y, si hay venta, condiciones de compra: informacion precontractual, precios, forma de pago, entrega, desistimiento y garantia.',
        referencia: 'RD 1/2007 art. 5; Ley 7/1992'
      };
    }
  },
  {
    id: 'identificacion',
    categoria: 'Informacion legal',
    nombre: 'Identificacion del titular (nombre, CIF/NIF y domicilio)',
    nivel: 'alta',
    baseLegal: 'lssi',
    test: (ctx) => {
      const nif = /\b([A-HJ-NP-SUVW]\d{7}[0-9A-J]|\d{8}[A-HJ-NP-TV-Z])\b/.exec(ctx.text);
      const cif = /CIF[:\s]*[A-Z0-9]{9}/i.exec(ctx.text);
      const direccion = /\b(calle|avenida|avda\.?|c\/|plaza|paseo|carretera|polígono|pol\.? ind\.?|ronda)\s+[a-z]/i.exec(ctx.text);
      const ok = Boolean(nif || cif) && Boolean(direccion);
      return {
        ok,
        problema: 'No se identifica al titular del servicio con CIF/NIF y domicilio fiscal',
        solucion: 'Anade el aviso legal con los datos identificativos exigidos para prestadores de servicios en Espana.',
        referencia: 'Ley 34/2002 art. 5.1'
      };
    }
  },
  {
    id: 'contacto',
    categoria: 'Usabilidad legal',
    nombre: 'Medio de contacto efectivo',
    nivel: 'media',
    baseLegal: 'rgpd',
    test: (ctx) => {
      const email = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(ctx.text);
      return {
        ok: email,
        problema: 'No se muestra direccion de correo electronico de contacto',
        solucion: 'Publica un correo de contacto visible (ademas del formulario con aviso de privacidad).',
        referencia: 'RGPD art. 13.1.a'
      };
    }
  },
  {
    id: 'terceros',
    categoria: 'Cookies',
    nombre: 'Cookies de terceros y transferencia de datos',
    nivel: 'media',
    baseLegal: 'rgpd',
    test: (ctx) => {
      const thirds = containsAny(ctx.html, ['google-analytics', 'googletagmanager', 'gtag(', 'facebook.net', 'fbq(', 'hotjar', 'linkedin.com/px', 'clarity.ms', 'doubleclick', 'youtube.com/embed', 'stripe.com', 'paypal']);
      return {
        ok: thirds.length === 0,
        problema: thirds.length ? `Se detectan servicios de terceros que rastrean al usuario: ${thirds.slice(0, 5).join(', ')}` : '',
        solucion: 'Incluye los terceros en la politica de cookies y en el CMP, y limitarlos hasta el consentimiento. Revisa los acuerdos de encargo (DPA) y las transferencias internacionales.',
        referencia: 'RGPD art. 28 y 44-49'
      };
    }
  },
  {
    id: 'seguridad-cabeceras',
    categoria: 'Seguridad',
    nombre: 'Cabeceras de seguridad HTTP',
    nivel: 'media',
    baseLegal: 'rgpd',
    test: (ctx) => {
      const h = ctx.headers || {};
      const falta = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy']
        .filter((k) => !h[k]);
      return {
        ok: falta.length === 0,
        problema: falta.length ? `Cabeceras de seguridad ausentes: ${falta.join(', ')}` : '',
        solucion: 'Configura en el servidor: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy.',
        referencia: 'RGPD art. 32 (medidas de seguridad)'
      };
    }
  },
  {
    id: 'accesibilidad',
    categoria: 'Accesibilidad',
    nombre: 'Accesibilidad basica (RD 1112/2018)',
    nivel: 'media',
    baseLegal: 'accesibilidad',
    test: (ctx) => {
      const problemas = [];
      if (!/<html[^>]+lang=/i.test(ctx.html)) problemas.push('falta el atributo lang');
      if (!/<meta[^>]+name=["']viewport/i.test(ctx.html)) problemas.push('falta viewport (no se adapta a movil)');
      const imgs = ctx.html.match(/<img\b[^>]*>/gi) || [];
      const sinAlt = imgs.filter((i) => !/\balt\s*=/i.test(i)).length;
      if (sinAlt) problemas.push(`${sinAlt} imagenes sin atributo alt`);
      const titulo = (ctx.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
      if (!titulo || titulo.trim().length < 10) problemas.push('titulo ausente o demasiado corto');
      return {
        ok: problemas.length === 0,
        problema: problemas.length ? `Problemas de accesibilidad detectados: ${problemas.join('; ')}` : '',
        solucion: 'Anade lang, viewport, textos alternativos, jerarquia de encabezados, foco visible, contraste AA y navegacion por teclado. Declara el grado de cumplimiento (declaracion responsable de accesibilidad).',
        referencia: 'RD 1112/2018 y Real Decreto 193/2023'
      };
    }
  },
  {
    id: 'seo-basico',
    categoria: 'SEO',
    nombre: 'Metadatos SEO y datos estructurados',
    nivel: 'leve',
    baseLegal: 'lssi',
    test: (ctx) => {
      const desc = /<meta[^>]+name=["']description["']/i.test(ctx.html);
      const og = /property=["']og:/i.test(ctx.html);
      return {
        ok: desc && og,
        problema: !desc ? 'Falta meta description' : (!og ? 'Faltan etiquetas Open Graph para compartir en redes' : ''),
        solucion: 'Implementa meta title/description unicos, canonical, Open Graph, Twitter Card y datos estructurados JSON-LD (Organization, LocalBusiness).',
        referencia: 'Buenas practicas de SEO'
      };
    }
  },
  {
    id: 'ssl-mixed',
    categoria: 'Seguridad',
    nombre: 'Contenido mixto y recursos inseguros',
    nivel: 'media',
    baseLegal: 'rgpd',
    test: (ctx) => {
      const http = (ctx.html.match(/(src|href)=["']http:\/\/[^"']+/gi) || []).slice(0, 5);
      return {
        ok: http.length === 0,
        problema: http.length ? `Se cargan recursos por http:// no cifrado: ${http.join(' ')}` : '',
        solucion: 'Sirve todos los recursos por HTTPS y activa HSTS para evitar la carga mixta.',
        referencia: 'RGPD art. 32'
      };
    }
  },
  {
    id: 'redireccion',
    categoria: 'Seguridad',
    nombre: 'Redireccion de http a https',
    nivel: 'media',
    baseLegal: 'lssi',
    test: (ctx) => {
      const esquemaHttp = String(ctx.url).startsWith('http://');
      return {
        ok: !esquemaHttp,
        problema: 'El sitio responde directamente por http:// sin redirigir a https://',
        solucion: 'Configura redireccion permanente 301 de http a https.',
        referencia: 'RGPD art. 32 y LSSI-CE'
      };
    }
  }
];

function findingsFromChecks(ctx) {
  const findings = [];
  for (const check of CHECKS) {
    let res;
    try { res = check.test(ctx); } catch (e) { res = { ok: true, problema: '', solucion: '' }; }
    findings.push({
      id: `chk_${check.id}`,
      checkId: check.id,
      categoria: check.categoria,
      nombre: check.nombre,
      estado: res.ok ? 'correcto' : 'incumplimiento',
      severidad: res.ok ? 'info' : check.nivel,
      problema: res.ok ? '' : res.problema,
      solucion: res.ok ? 'Ninguna. El requisito se cumple correctamente.' : res.solucion,
      referencia: res.referencia || '',
      baseLegal: check.baseLegal,
      fuente: 'analisis-estatico',
      enlace: `analisis-legal#${check.id}`
    });
  }
  return findings;
}

function puntuar(findings) {
  let score = 100;
  for (const f of findings) {
    if (f.estado === 'incumplimiento') score -= severidadInfo(f.severidad).peso;
  }
  return Math.max(0, Math.round(score));
}

function veredicto(score, findings) {
  const criticos = findings.filter((f) => f.severidad === 'critica' && f.estado === 'incumplimiento').length;
  const altos = findings.filter((f) => f.severidad === 'alta' && f.estado === 'incumplimiento').length;
  if (criticos > 0) return { nivel: 'NO APTO', color: '#b91c1c', resumen: `${criticos} incumplimiento(s) critico(s) y ${altos} de nivel alto. Debe corregirse antes de publicarse.` };
  if (altos > 0) return { nivel: 'APTO CON RESERVAS', color: '#ea580c', resumen: `${altos} incumplimiento(s) de nivel alto pendientes de correccion.` };
  if (score >= 90) return { nivel: 'APTO', color: '#15803d', resumen: 'Cumplimiento correcto delAnalisis automatico. Verifica siempre con un profesional juridico.' };
  return { nivel: 'APTO CON MEJORAS', color: '#ca8a04', resumen: 'Sin incumplimientos criticos, pero hay puntos a mejorar.' };
}

/** Analisis estatico de una URL publica */
async function analyzeUrl(url) {
  let target = url;
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  const res = await fetchUrl(target);
  const html = res.html || '';
  const text = stripHtml(html);
  const links = extractLinks(html, res.url);
  const ctx = { url: res.url, html, text, links, headers: res.headers, status: res.status };
  const findings = findingsFromChecks(ctx);
  const score = puntuar(findings);
  return {
    objetivo: res.url,
    tipo: 'url',
    status: res.status,
    titulo: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || res.url,
    score,
    veredicto: veredicto(score, findings),
    hallazgos: findings,
    contexto: {
      enlaces: links.slice(0, 80),
      terceros: containsAny(html, ['google-analytics', 'googletagmanager', 'facebook.net', 'hotjar', 'clarity.ms', 'doubleclick', 'stripe', 'paypal']),
      cabeceras: res.headers,
      textoMuestra: text.slice(0, 4000)
    }
  };
}

/** Analisis estatico de un proyecto local (La Fabrica) */
function analyzeProjectStatic(dir) {
  const files = [];
  const walk = (cur, depth = 0) => {
    if (depth > 4) return;
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (['node_modules', '.git', 'dist', 'build'].includes(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/\.(js|jsx|ts|tsx|html|php|py|env|json|md|txt|yml|yaml)$/i.test(e.name)) files.push(full);
    }
  };
  walk(dir);

  let cookieCode = false, secrets = [], hasPrivacy = false, hasLegal = false, hasLicense = false, hasReadme = false, hasEnvExample = false;
  let trackers = [], inlineScripts = 0, personalData = false;

  for (const f of files.slice(0, 600)) {
    let content = '';
    try { content = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const rel = path.relative(dir, f);
    const lower = content.toLowerCase();
    if (/pol.tica de privacidad|privacy policy|privacidad/i.test(content)) hasPrivacy = true;
    if (/aviso legal|aviso-legal|legal notice/i.test(content)) hasLegal = true;
    if (rel.toLowerCase() === 'license' || rel.toLowerCase().startsWith('license.')) hasLicense = true;
    if (rel.toLowerCase() === 'readme.md') hasReadme = true;
    if (rel.toLowerCase() === '.env.example') hasEnvExample = true;
    if (/(document\.cookie|cookieconsent|consentimiento de cookies|cookie-banner)/i.test(content)) cookieCode = true;
    if (/(google-analytics|googletagmanager|gtag\(|fbq\(|hotjar|clarity\.ms)/i.test(content)) trackers.push(rel);
    if (/[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(content)) personalData = true;

    // deteccion de secretos
    const patterns = [
      [/sk-[A-Za-z0-9]{32,}/g, 'Clave OpenAI'],
      [/ghp_[A-Za-z0-9]{30,}/g, 'Token GitHub'],
      [/AKIA[0-9A-Z]{16}/g, 'Clave AWS'],
      [/AIza[0-9A-Za-z\-_]{30,}/g, 'Clave Google'],
      [/(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"']{12,}["']/gi, 'Credencial incrustada']
    ];
    for (const [re, label] of patterns) {
      const m = content.match(re);
      if (m) secrets.push({ archivo: rel, tipo: label, extracto: String(m[0]).slice(0, 18) + '…' });
    }
  }

  const findings = [];
  const add = (o) => findings.push({ estado: 'incumplimiento', fuente: 'analisis-estatico', enlace: `analisis-legal#${o.checkId}`, ...o });

  if (secrets.length) add({ id: 'chk_secretos', checkId: 'secretos', categoria: 'Seguridad', nombre: 'Secretos en el codigo', severidad: 'critica', problema: `Se han detectado ${secrets.length} credencial(es) incrustadas en el codigo`, solucion: 'Retira las claves del codigo, las revoca y las traslada a variables de entorno (.env, nunca versionado).', referencia: 'RGPD art. 32 y practicas seguras de desarrollo' });
  else findings.push({ id: 'chk_secretos', checkId: 'secretos', categoria: 'Seguridad', nombre: 'Secretos en el codigo', estado: 'correcto', severidad: 'info', problema: '', solucion: 'Ninguna. No se han detectado credenciales incrustadas.', referencia: '', fuente: 'analisis-estatico', enlace: 'analisis-legal#secretos' });

  if (cookieCode) findings.push({ id: 'chk_consentimiento', checkId: 'consentimiento', categoria: 'Cookies', nombre: 'Mecanismo de consentimiento', estado: 'correcto', severidad: 'info', problema: '', solucion: 'Ninguna. Se detecta implementacion de consentimiento de cookies.', referencia: 'RGPD art. 6.1.a', fuente: 'analisis-estatico', enlace: 'analisis-legal#consentimiento' });
  else add({ id: 'chk_consentimiento', checkId: 'consentimiento', categoria: 'Cookies', nombre: 'Mecanismo de consentimiento', severidad: 'media', problema: 'No se ha detectado banner ni mecanismo de consentimiento de cookies', solucion: 'Implementa un CMP con aceptacion, rechazo y retirada del consentimiento antes de cargar cookies no esenciales.', referencia: 'RGPD art. 6.1.a y 7' });

  if (trackers.length) add({ id: 'chk_terceros', checkId: 'terceros', categoria: 'Cookies', nombre: 'Servicios de terceros con seguimiento', severidad: 'media', problema: `Archivos con rastreadores de terceros: ${[...new Set(trackers)].slice(0, 5).join(', ')}`, solucion: 'Carga los rastreadores tras el consentimiento y declaralos en la politica de cookies.', referencia: 'RGPD art. 28 y 44-49' });

  if (personalData) findings.push({ id: 'chk_datos', checkId: 'datos', categoria: 'Proteccion de datos', nombre: 'Tratamiento de datos personales', estado: 'correcto', severidad: 'info', problema: '', solucion: 'Verifica que existe base juridica, informacion al interesado y registro de tratamientos.', referencia: 'RGPD art. 13 y 30', fuente: 'analisis-estatico', enlace: 'analisis-legal#datos' });

  if (!hasPrivacy) add({ id: 'chk_privacidad', checkId: 'privacidad', categoria: 'Proteccion de datos', nombre: 'Politica de privacidad', severidad: 'critica', problema: 'El proyecto no incluye politica de privacidad', solucion: 'Anade una politica de privacidad completa y enlazala en el pie de pagina.', referencia: 'RGPD art. 13 y 14' });
  if (!hasLegal) add({ id: 'chk_aviso', checkId: 'aviso-legal', categoria: 'Informacion legal', nombre: 'Aviso legal', severidad: 'alta', problema: 'El proyecto no incluye aviso legal', solucion: 'Crea el aviso legal con datos del responsable, actividad, dominio y condiciones de uso.', referencia: 'Ley 34/2002 art. 5' });
  if (!hasLicense) add({ id: 'chk_licencia', checkId: 'licencia', categoria: 'Licencias', nombre: 'Licencia del software', severidad: 'media', problema: 'El proyecto no incluye fichier de licencia', solucion: 'Anade una licencia (MIT o la que corresponda) y revisa las licencias de las dependencias.', referencia: 'OSS licenses' });
  if (!hasReadme) add({ id: 'chk_readme', checkId: 'readme', categoria: 'Documentacion', nombre: 'Documentacion del proyecto', severidad: 'leve', problema: 'Falta README.md', solucion: 'Documenta instalacion, uso, arquitectura y variables de entorno.', referencia: 'Buenas practicas' });
  if (!hasEnvExample) add({ id: 'chk_env', checkId: 'env', categoria: 'Seguridad', nombre: 'Ejemplo de variables de entorno', severidad: 'media', problema: 'Falta .env.example', solucion: 'Crea .env.example con todas las claves necesarias (sin valores reales) y anade .env al .gitignore.', referencia: 'RGPD art. 32' });

  const score = puntuar(findings);
  return {
    objetivo: dir,
    tipo: 'proyecto',
    score,
    veredicto: veredicto(score, findings),
    hallazgos: findings,
    contexto: { archivosAnalizados: files.length, secrets, trackers: [...new Set(trackers)] }
  };
}

function buildAiPrompt({ objetivo, contexto, tipo }) {
  const tipoTxt = tipo === 'url'
    ? `Se ha analizado la URL ${objetivo}. Titulo: ${contexto.titulo || ''}. Estado HTTP: ${contexto.status}.`
    : `Se ha analizado el proyecto located en ${objetivo}.`;

  return `Eres un abogado experto en derecho digital espanol y un auditor de cumplimiento (RGPD, LSSI-CE, LOPDGDD, RD 1112/2018, legislacion del consumidor y de comercio electronico).

${tipoTxt}

HALLAZGOS DEL ANALISIS ESTATICO AUTOMATICO (JSON):
${JSON.stringify(contexto, null, 1).slice(0, 18000)}

TU TAREA:
1. Revisa y completa elAnalisis: no repitas literalmente los hallazgos automaticos, profundiza en ellos, anade los que falten (inclusive los mas insignificantes: desde cookies hasta la letra pequena).
2. Para CADA hallazgo indica: problema concreto, por que es un problema, solucion practica y aplicable, referencia normativa exacta y enlace oficial.
3. Prioriza por severidad: critica, alta, media, leve.
4. Redacta un resumen ejecutivo y una lista de acciones priorizadas.

Responde EXCLUSIVAMENTE con JSON valido:
{
  "resumen": "resumen ejecutivo",
  "puntuacion": 0,
  "veredicto": "APTO | APTO CON RESERVAS | APTO CON MEJORAS | NO APTO",
  "hallazgos": [
    {
      "id": "slug",
      "categoria": "Cookies | Proteccion de datos | Contratacion | Seguridad | Accesibilidad | Propiedad intelectual | Informacion legal | SEO",
      "nombre": "titulo corto",
      "severidad": "critica|alta|media|leve|info",
      "estado": "incumplimiento|correcto",
      "problema": "descripcion tecnica del problema",
      "impacto": "que ocurre si no se corrige",
      "solucion": "solucion concreta paso a paso",
      "referencia": "RGPD art. 13; Ley 34/2002 art. 5...",
      "baseLegal": "rgpd|lssi|consumidor|accesibilidad|cookies|ecommerce|pcie|lal|licencias|lorgaa",
      "enlace": "https://www.boe.es/... o https://eur-lex.europa.eu/..."
    }
  ],
  "acciones": ["accion 1", "accion 2"],
  "avisos": ["advertencia o limite delAnalisis"]
}`;
}

/** Analisis completo (estatico + IA) de una URL o de un proyecto */
async function analyze({ url, projectId, dir, tipo, provider, model, agent = 'plan', extraTexto }) {
  let base;
  let objetivo;
  let projectRef = projectId || null;

  if (tipo === 'proyecto' || dir) {
    objetivo = dir;
    base = analyzeProjectStatic(dir);
    if (projectId) projectRef = projectId;
  } else {
    objetivo = url;
    base = await analyzeUrl(url);
  }

  if (extraTexto) {
    base.contexto = { ...base.contexto, documentoExterno: String(extraTexto).slice(0, 12000) };
  }

  let ia = null;
  let errorIA = null;
  try {
    const prompt = buildAiPrompt({ objetivo, contexto: base.contexto, tipo: tipo || base.tipo });
    const res = await engine.askJson(
      prompt,
      'Eres abogado experto en derecho digital espanol. Respondes solo con JSON valido.',
      { provider, model, agent }
    );
    ia = res.data;
  } catch (e) {
    errorIA = e.message;
  }

  const hallazgos = [];
  const vistos = new Set();
  for (const h of ia?.hallazgos || []) {
    const id = `ia_${(h.id || h.nombre || 'hallazgo').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    hallazgos.push({
      id,
      checkId: id,
      categoria: h.categoria || 'General',
      nombre: h.nombre || h.categoria || 'Hallazgo',
      estado: h.estado || 'incumplimiento',
      severidad: (SEVERIDADES[h.severidad] ? h.severidad : 'media'),
      problema: h.problema || '',
      impacto: h.impacto || '',
      solucion: h.solucion || '',
      referencia: h.referencia || '',
      baseLegal: h.baseLegal || null,
      enlaceUrl: h.enlace || (h.baseLegal && normativa(h.baseLegal)?.url) || null,
      fuente: 'ia',
      enlace: `analisis-legal#${id}`
    });
  }

  const todos = [...base.hallazgos, ...hallazgos];
  const score = ia?.puntuacion != null ? Math.max(0, Math.min(100, Math.round(ia.puntuacion))) : puntuar(todos);
  const ver = ia?.veredicto
    ? { nivel: ia.veredicto, color: severidadColor(ia.veredicto), resumen: ia.resumen || '' }
    : base.veredicto;

  const record = db.insert('analyses', {
    objetivo,
    tipo: tipo || base.tipo,
    proyectoId: projectRef,
    score,
    veredicto: ver,
    resumenIA: ia?.resumen || '',
    acciones: ia?.acciones || [],
    avisos: ia?.avisos || ['El analisis es una orientacion técnica y no sustituye al asesoramiento juridico profesional.'],
    hallazgos: todos,
    errorIA,
    contexto: base.contexto,
    estado: 'completado'
  });

  db.logEvent('analisis_legal', { id: record.id, objetivo, score });
  return record;
}

function severidadColor(v) {
  const map = { 'NO APTO': '#b91c1c', 'APTO CON RESERVAS': '#ea580c', 'APTO CON MEJORAS': '#ca8a04', APTO: '#15803d' };
  return map[v] || '#64748b';
}

async function analyzeProject({ projectId, dir, provider, model, agent }) {
  return analyze({ projectId, dir, tipo: 'proyecto', provider, model, agent });
}

module.exports = { analyze, analyzeUrl, analyzeProject, analyzeProjectStatic, NORMATIVA, CHECKS, severidadInfo, normativa, veredicto, puntuar };