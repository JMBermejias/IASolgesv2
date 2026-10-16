/**
 * IASolges.v2 - Localizacion de clientes por mapa (Nominatim + Overpass/OSM + analisis IA)
 */
const { getSettings } = require('./config');
const db = require('./db');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.mail.ru/api/interpreter'
];

/** Catálogo de sectores soportados con sus etiquetas OSM */
const CATEGORIES = [
  { id: 'restaurantes', label: 'Restaurantes y hostelería', tags: { amenity: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food'] } },
  { id: 'comercios', label: 'Comercios y retail', tags: { shop: ['*'] } },
  { id: 'servicios', label: 'Servicios profesionales', tags: { office: ['*'], craft: ['*'] } },
  { id: 'salud', label: 'Salud y clínicas', tags: { amenity: ['doctors', 'dentist', 'pharmacy', 'clinic', 'veterinary'] } },
  { id: 'belleza', label: 'Belleza y bienestar', tags: { shop: ['hairdresser', 'beauty', 'massage', 'spa', 'cosmetics', 'nail_salon'] } },
  { id: 'talleres', label: 'Talleres y automoción', tags: { shop: ['car_repair', 'car', 'tyres', 'motorcycle'], craft: ['plumber', 'electrician', 'carpenter', 'painter', 'hvac'] } },
  { id: 'inmuebles', label: 'Inmuebles', tags: { shop: ['estate_agent'], office: ['real_estate'] } },
  { id: 'educacion', label: 'Educación y formación', tags: { amenity: ['school', 'kindergarten', 'college', 'university'], shop: ['books'] } },
  { id: 'deporte', label: 'Deporte y ocio', tags: { leisure: ['*'], sport: ['*'] } },
  { id: 'logistica', label: 'Logística e industria', tags: { industrial: ['*'], office: ['logistics', 'company'] } },
  { id: 'agencias', label: 'Agencias y viajes', tags: { shop: ['travel_agent', 'bank', 'insurance'] } },
  { id: 'pequenas', label: '🏪 Pequeñas empresas y autónomos', tags: { craft: ['*'], office: ['*'], healthcare: ['*'], service: ['*'] } },
  { id: 'todos', label: 'Todos los sectores', tags: { '*': ['*'] } }
];

/**
 * Etiquetas adicionales de pequeños negocios y autónomos profesionales.
 * Se añaden a CUALQUIER búsqueda (si el usuario lo activa) para que no se queden
 * fuera negocios pequeños que no usan las etiquetas del sector buscado.
 */
const SECTORES_AMPLIOS = ['todos', 'pequenas'];

const ETIQUETAS_PEQUENOS = [
  { shop: ['*'] },
  { craft: ['*'] },
  { office: ['*'] },
  { healthcare: ['*'] },
  { service: ['*'] },
  { 'man_made': ['*'] },
  { amenity: ['*'] },
  { building: ['commercial', 'retail', 'office', 'service', 'craft'] }
];

function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

function userAgent() {
  return getSettings().geolocation?.userAgent || 'IASolges.v2/2.0';
}

async function fetchJson(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Fetch con reintentos: los servicios de OSM son Publicos y se caen o limitan con frecuencia */
async function fetchRetry(url, options = {}, { intentos = 3, esperaMs = 900, timeoutMs = 30000 } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const texto = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return JSON.parse(texto); } catch (_) { throw new Error('Respuesta no JSON'); }
    } catch (e) {
      ultimo = e;
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaMs * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw ultimo || new Error('Fallo de red');
}

/** Geocodificacion de texto a coordenadas (Nominatim) */
async function geocode(query) {
  if (!query) throw new Error('Consulta vacia');
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`;
  const data = await fetchRetry(url, { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'es' } }, { intentos: 4 });
  return (data || []).map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
    category: r.category,
    boundingbox: r.boundingbox
  }));
}

/** Geocodificacion inversa (coordenadas -> direccion) */
async function reverse(lat, lon) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`;
  try {
    const d = await fetchRetry(url, { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'es' } }, { intentos: 2 });
    return { label: d.display_name, address: d.address || {}, lat, lon };
  } catch (_) {
    return null;
  }
}

/**
 * Construye la consulta de Overpass.
 *
 * REGLA IMPORTANTE: el sector elegido es un FILTRO ESTRICTO. Si eliges un sector
 * concreto (restaurantes, comercios, salud...) solo se usan sus etiquetas, aunque
 * marques "incluir pequeñas empresas y autónomos". Ese modo amplio solo se aplica a
 * "Todos los sectores" y "Pequeñas empresas y autónomos", donde el objetivo es
 * justamente barrer todo el tejido comercial de la zona.
 *
 * `pool` es el número de elementos pedidos al servidor (mayor que el límite final)
 * para quedarse con los MÁS CERCANOS tras ordenar, en lugar de los que el servidor
 * entregue por azar.
 */
function buildOverpassQuery(cat, lat, lon, radiusKm, pool, incluirPequenos = false) {
  const radius = Math.max(100, Math.round(radiusKm * 1000)); // Overpass trabaja en metros
  const clauses = [];
  const tags = { ...cat.tags };

  // El modo amplio solo se aplica si NO hay un sector concreto que respetar
  const sectorEstricto = !SECTORES_AMPLIOS.includes(cat.id);
  if (incluirPequenos && !sectorEstricto) {
    for (const extra of ETIQUETAS_PEQUENOS) {
      for (const [k, v] of Object.entries(extra)) {
        if (!tags[k]) tags[k] = v.includes('*') ? ['*'] : [...(tags[k] || []), ...v];
      }
    }
  }

  const vistos = new Set();
  for (const [key, values] of Object.entries(tags)) {
    const firma = `${key}:${values.join('|')}`;
    if (vistos.has(firma)) continue;
    vistos.add(firma);

    if (key === '*') {
      // cualquier elemento con nombre propio
      clauses.push(`  node["name"](around:${radius},${lat},${lon});`);
      clauses.push(`  way["name"](around:${radius},${lat},${lon});`);
      continue;
    }
    if (values.includes('*')) {
      clauses.push(`  node["${key}"](around:${radius},${lat},${lon});`);
      clauses.push(`  way["${key}"](around:${radius},${lat},${lon});`);
      clauses.push(`  relation["${key}"](around:${radius},${lat},${lon});`);
    } else {
      const re = `^(${values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
      clauses.push(`  node["${key}"~"${re}"](around:${radius},${lat},${lon});`);
      clauses.push(`  way["${key}"~"${re}"](around:${radius},${lat},${lon});`);
      clauses.push(`  relation["${key}"~"${re}"](around:${radius},${lat},${lon});`);
    }
  }
  return `[out:json][timeout:90];(\n${clauses.join('\n')}\n);out center ${pool};`;
}

async function overpass(query, maxEndpoints = OVERPASS.length) {
  const endpoints = OVERPASS.slice(0, maxEndpoints);
  let ultimoError = null;

  for (let ronda = 0; ronda < endpoints.length; ronda += 1) {
    const restantes = endpoints.slice(ronda);
    const conDatos = [];
    const inmediato = { json: null };

    // Carrera entre los espejos disponibles: gana el primero que responde bien
    const intentos = restantes.map((endpoint) => fetchRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent() },
      body: 'data=' + encodeURIComponent(query)
    }, { intentos: 1, timeoutMs: 45000 }).then((json) => {
      if (!json || !Array.isArray(json.elements)) throw new Error('Respuesta Overpass invalida');
      if (json.elements.length) conDatos.push({ endpoint, json });
      else if (!inmediato.json) inmediato.json = json;
      if (process.env.IASOLGES_DEBUG) console.log(`[overpass] ${endpoint} -> ${json.elements.length} elementos`);
      return { endpoint, json };
    }));

    try {
      await Promise.any(intentos);
    } catch (e) {
      ultimoError = e;
    }

    if (conDatos.length) return conDatos[0].json;

    // Respuesta vacia: damos unos segundos a los demas espejos por si traen datos
    if (inmediato.json) {
      const t0 = Date.now();
      while (!conDatos.length && Date.now() - t0 < 5000) {
        await new Promise((r) => setTimeout(r, 250));
      }
      if (conDatos.length) return conDatos[0].json;
      return inmediato.json;
    }
  }
  throw ultimoError || new Error('Overpass no disponible');
}

/** Alternativa cuando Overpass no responde: POIs de Nominatim por palabra clave + lugar */
async function nominatimPois({ center, category, limit }) {
  const cat = categoryById(category);
  const palabra = (cat.id === 'todos' ? 'comercio' : cat.label.toLowerCase().split(' ')[0]);
  const lugar = String(center.label || '').split(',').slice(0, 2).join(',').trim();
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&extratags=1&limit=${Math.min(50, limit)}&countrycodes=es&q=${encodeURIComponent(`${palabra} ${lugar}`)}`;
  const data = await fetchRetry(url, { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'es' } }, { intentos: 3 });
  return (data || []).map((r) => ({
    type: 'node',
    id: r.osm_id,
    osmType: r.osm_type,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    name: r.name || r.display_name.split(',')[0],
    tags: {
      ...(r.extratags || {}),
      name: r.name,
      shop: r.category === 'shop' ? r.type : undefined,
      amenity: r.category === 'amenity' ? r.type : undefined,
      ...(r.address || {})
    }
  }));
}

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pickContact(tags = {}) {
  const phone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
  const website = tags.website || tags['contact:website'] || tags['url'] || null;
  const email = tags.email || tags['contact:email'] || null;
  const socials = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok']
    .map((k) => (tags[`contact:${k}`] ? { red: k, url: tags[`contact:${k}`] } : null))
    .filter(Boolean);
  return { phone, website, email, socials, openingHours: tags.opening_hours || null };
}

function labelFromTags(tags = {}, type, center = null) {
  const street = tags['addr:street'] || tags['contact:street'] || '';
  const number = tags['addr:housenumber'] || '';
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
  const postcode = tags['addr:postcode'] || '';
  const composed = [street && `${street} ${number}`.trim(), postcode, city].filter(Boolean).join(', ');
  if (composed) return composed;

  // Sin direccion en las etiquetas: se indica la localidad de la zona en lugar del
  // nombre tecnico del elemento de OpenStreetMap (por ejemplo "node" o "way").
  const zona = center?.label ? String(center.label).split(',').slice(0, 2).join(',').trim() : '';
  const tipo = type && type !== 'node' && type !== 'way' && type !== 'relation'
    ? type.replace(/_/g, ' ')
    : '';
  if (zona && tipo) return `${zona} (${tipo})`;
  if (zona) return zona;
  if (tipo) return `Sin calle registrada (${tipo})`;
  return 'Sin dirección registrada';
}

/**
 * Analisis por medios: reparte la probabilidad de contratacion en distintos
 * vectores de analisis (cercania, sector, presencia digital, senal, competencia...).
 */
function analyseClient(poi, ctx) {
  const { radius, center, totalFound, index } = ctx;
  const tags = poi.tags || {};
  const contact = pickContact(tags);

  // 1. Cercania (0-100): mas cerca = mas valor
  const dist = poi.distanceKm ?? 0;
  const proximity = Math.max(0, Math.round(100 * (1 - dist / Math.max(radius, 0.001))));

  // 2. Sector / actividad
  let sector = 40;
  if (tags.shop || tags.amenity || tags.craft || tags.office || tags.leisure) sector = 75;
  if (tags.website) sector += 15;
  if (tags.brand) sector += 10;
  sector = Math.min(100, sector);

  // 3. Presencia digital (oportunidad de mejora = cliente potencial)
  const digitalSignals = [contact.website, contact.email, contact.phone, contact.socials.length].filter(Boolean).length;
  const digital = Math.round((digitalSignals / 4) * 100);
  const oportunidadDigital = 100 - digital; // sin presencia digital = oportunidad de venta

  // 4. Senal de mercado (capacidad de inversionar)
  let senal = 35;
  if (tags.website) senal += 20;
  if (tags.opening_hours) senal += 15;
  if (tags.wheelchair) senal += 5;
  if (tags['contact:facebook'] || tags['contact:instagram']) senal += 10;
  if (tags.operator && tags.operator !== tags.name) senal += 10;
  senal = Math.min(100, senal);

  // 5. Prioridad de catchment (densidad de competencia en la zona)
  const densidad = Math.round(Math.min(100, (totalFound / Math.max(1, (radius * 2))) * 100));

  const opciones = [
    { medio: 'Cercanía geográfica', porcentaje: proximity, detalle: `${dist.toFixed(2)} km del centro de búsqueda (radio ${radius} km)` },
    { medio: 'Encaje del sector', porcentaje: sector, detalle: tags.shop || tags.amenity || tags.craft || tags.office || tags.leisure || 'actividad general' },
    { medio: 'Presencia digital actual', porcentaje: digital, detalle: `${digitalSignals}/4 contactos públicos detectados` },
    { medio: 'Oportunidad de digitalizacion', porcentaje: oportunidadDigital, detalle: `${100 - digital}% de superficie de mejora detectada` },
    { medio: 'Capacidad de inversión', porcentaje: senal, detalle: tags.brand ? `marca registrada: ${tags.brand}` : 'comercio independiente' },
    { medio: 'Densidad de mercado', porcentaje: densidad, detalle: `${totalFound} negocios en el area analizada` }
  ];

  const probabilidad = Math.round(
    (proximity * 0.3 + sector * 0.2 + oportunidadDigital * 0.2 + senal * 0.2 + Math.min(100, (index + 1) * 5) * 0.1)
  );

  const ticket = Math.round((1800 + senal * 42 + sector * 25) / 50) * 50;

  return {
    id: `osm_${poi.osmType || 'node'}_${poi.id}`,
    nombre: poi.name || tags.name || tags.brand || 'Negocio sin nombre',
    categoria: tags.shop || tags.amenity || tags.craft || tags.office || tags.leisure || tags.industrial || 'comercio',
    direccion: labelFromTags(tags, poi.type, center),
    lat: poi.lat,
    lon: poi.lon,
    distanciaKm: Number(dist.toFixed(2)),
    contacto: contact,
    etiquetas: tags,
    opciones,
    probabilidad: Math.max(3, Math.min(98, probabilidad)),
    prioridad: probabilidad >= 70 ? 'alta' : probabilidad >= 45 ? 'media' : 'baja',
    ticketEstimado: ticket,
    estado: 'nuevo',
    createdAt: new Date().toISOString(),
    origen: 'openstreetmap'
  };
}

/**
 * Afina el centro cuando Nominatim devuelve el centroide del municipio:
 * busca el nucleo urbano real (place=city|town|village) mas cercano.
 */
async function refineCenter(center, query) {
  const palabra = String(query || '').split(',')[0].trim();
  if (!palabra) return center;
  const re = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const q = `[out:json][timeout:20];node["place"~"^(city|town|village|hamlet)$"]["name"~"^${re}$",i](around:30000,${center.lat},${center.lon});out center 5;`;
  try {
    const json = await overpass(q, 1);
    const els = (json.elements || []).filter((e) => typeof e.lat === 'number');
    if (!els.length) return center;
    els.sort((a, b) => haversine(center, { lat: a.lat, lon: a.lon }) - haversine(center, { lat: b.lat, lon: b.lon }));
    const nucleo = els[0];
    return { lat: nucleo.lat, lon: nucleo.lon, label: `${nucleo.tags?.name || palabra}, ${center.label.split(',').slice(1).join(',').trim()}`.trim() };
  } catch (_) {
    return center;
  }
}

/**
 * Búsqueda completa de clientes potenciales alrededor de un punto.
 * Devuelve hasta `limit` clientes, priorizando los más cercanos e incluyendo
 * pequeños negocios y autónomos (en OSM aparecen con etiquetas muy diversas).
 */
async function search({ query, lat, lon, radius = 5, category = 'todos', limit, incluirPequenos = true }) {
  // Cantidad máxima de clientes solicitada por el usuario (10 a 300)
  const maxClientes = Math.min(300, Math.max(10, parseInt(limit, 10) || 60));
  // Se piden más elementos de los que se van a mostrar, para poder ordenar por
  // cercanía y descartar duplicados. Sin esto el servidor devuelve los que le salen
  // y solo aparecen los negocios más conocidos.
  const pool = Math.min(800, Math.max(maxClientes * 2, maxClientes + 40));
  let center = { lat, lon, label: query || 'Punto seleccionado' };
  let candidatos = [];
  if (query && (lat === undefined || lon === undefined)) {
    candidatos = await geocode(query);
    if (!candidatos.length) throw new Error(`No se ha encontrado la ubicación "${query}"`);
    const prioridad = { city: 0, town: 1, village: 2, municipality: 3, borough: 4, suburb: 5, quarter: 6, neighbourhood: 7, hamlet: 8, isolated_dwelling: 9, farm: 10 };
    const mejor = [...candidatos].sort((a, b) => (prioridad[a.type] ?? 11) - (prioridad[b.type] ?? 11))[0];
    center = await refineCenter({ lat: mejor.lat, lon: mejor.lon, label: mejor.label }, query);
  }
  const cat = categoryById(category);
  const queryOsm = buildOverpassQuery(cat, center.lat, center.lon, radius, pool, incluirPequenos);
  let raw;
  let motor = 'overpass';
  if (process.env.IASOLGES_DEBUG) console.log(`[overpass] consulta:\n${queryOsm}`);
  try {
    raw = await overpass(queryOsm);
    if (!raw.elements.length && category !== 'todos') {
      // sin resultados en el radio: ampliamos automáticamente una vez
      raw = await overpass(buildOverpassQuery(cat, center.lat, center.lon, Math.min(radius * 2.5, 40), pool, incluirPequenos));
    }
  } catch (e) {
    motor = 'nominatim';
    try {
      const elements = await nominatimPois({ center, category, limit: maxClientes });
      raw = { elements };
    } catch (e2) {
      throw new Error(`No se han podido obtener datos de localización: ${e2.message} (Overpass: ${e.message})`);
    }
  }

  // Si Overpass responde pero sin datos (servidor saturado o sin cobertura),
  // se recurre a Nominatim antes de devolver un resultado vacio.
  if (!raw.elements.length) {
    try {
      const elements = await nominatimPois({ center, category, limit: maxClientes });
      if (elements.length) {
        raw = { elements };
        motor = 'nominatim';
        if (process.env.IASOLGES_DEBUG) console.log(`[overpass] sin datos, usando Nominatim: ${elements.length}`);
      }
    } catch (_) { /* sin alternativas disponibles */ }
  }

  const elements = (raw.elements || []).map((el) => {
    const lat2 = el.lat ?? el.center?.lat;
    const lon2 = el.lon ?? el.center?.lon;
    return { ...el, lat: lat2, lon: lon2 };
  }).filter((el) => typeof el.lat === 'number' && typeof el.lon === 'number'
    && (el.tags?.name || el.tags?.brand || el.tags?.operator));

  elements.forEach((el) => { el.distanceKm = haversine(center, { lat: el.lat, lon: el.lon }); });

  // Orden por cercanía y eliminación de duplicados (mismo nombre en el mismo punto)
  elements.sort((a, b) => a.distanceKm - b.distanceKm);
  const sinDuplicados = [];
  const firmas = new Set();
  for (const el of elements) {
    const nombre = (el.tags?.name || el.tags?.brand || el.tags?.operator || '').toLowerCase().trim();
    const firma = `${nombre}|${el.lat.toFixed(4)}|${el.lon.toFixed(4)}`;
    if (firmas.has(firma)) continue;
    firmas.add(firma);
    sinDuplicados.push(el);
  }

  const clientes = sinDuplicados.slice(0, maxClientes).map((el, i) =>
    analyseClient(el, { radius, center, totalFound: sinDuplicados.length, index: i })
  );

  return {
    center,
    candidatos,
    categoria: { id: cat.id, label: cat.label },
    total: sinDuplicados.length,
    radio: radius,
    motor,
    limite: maxClientes,
    incluidosPequenos: Boolean(incluirPequenos) && SECTORES_AMPLIOS.includes(cat.id),
    sectorEstricto: !SECTORES_AMPLIOS.includes(cat.id),
    truncado: sinDuplicados.length > maxClientes,
    clientes
  };
}

/** Analisis IA del conjunto de clientes (segmentacion, priorizacion y guion de contacto) */
function buildAnalysisPrompt({ resultado, objetivo, servicio }) {
  const top = resultado.clientes.slice(0, 40).map((c) => ({
    nombre: c.nombre, categoria: c.categoria, direccion: c.direccion,
    distanciaKm: c.distanciaKm, probabilidad: c.probabilidad,
    web: c.contacto.website || null, telefono: c.contacto.phone || null,
    opciones: c.opciones.map((o) => `${o.medio}: ${o.porcentaje}%`)
  }));
  return `Eres un consultor comercial experto en venta de productos y servicios digitales en Espana.
Analiza estos clientes potenciales localizados alrededor de: ${resultado.center.label}
Objetivo comercial: ${objetivo || 'conseguir clientes que necesiten una presencia digital profesional'}
Servicio a ofrecer: ${servicio || 'diseño web, aplicaciones, automatizacion con IA y marketing digital'}

CLIENTES:
${JSON.stringify(top, null, 1)}

Devuelve EXCLUSIVAMENTE un JSON valido con esta estructura:
{
  "resumen": "resumen ejecutivo de 3-4 frases",
  "segmentos": [{ "segmento": "nombre", "clientes": ["nombre1"], "estrategia": "..." }],
  "priorizados": [{ "nombre": "...", "motivo": "...", "accion": "...", "probabilidad": 0-100 }],
  "argumentarios": [{ "objetivo": "resistencia del cliente", "respuesta": "..." }],
  "ofertas": [{ "nombre": "...", "precioOrientativo": 0, "incluye": ["..."] }],
  "riesgos": ["..."]
}`;
}

/** Guarda como clientes los resultados seleccionados */
function saveSelected(clientes, extra = {}) {
  const guardados = [];
  for (const c of clientes) {
    const record = db.insert('clientes', { ...c, ...extra, estado: c.estado || 'nuevo', origen: c.origen || 'mapa' });
    guardados.push(record);
  }
  db.logEvent('clientes_guardados', { total: guardados.length });
  return guardados;
}

module.exports = { CATEGORIES, search, geocode, reverse, saveSelected, buildAnalysisPrompt, categoryById };