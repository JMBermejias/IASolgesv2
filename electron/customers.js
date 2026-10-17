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
async function geocode(query, timeoutMs) {
  if (!query) throw new Error('Consulta vacia');
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`;
  const data = await fetchRetry(url, { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'es' } }, { intentos: 2, timeoutMs: timeoutMs || 12000 });
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
function clausesDeEtiquetas(tags, radius, lat, lon) {
  const clauses = [];
  const vistos = new Set();
  for (const [key, values] of Object.entries(tags)) {
    const firma = `${key}:${values.join('|')}`;
    if (vistos.has(firma)) continue;
    vistos.add(firma);

    if (key === '*') {
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
  return clauses;
}

/**
 * Construye las consultas de Overpass.
 *
 * Se generan VARIAS consultas en lugar de una gigante: una por bloque de etiquetas.
 * Así el servidor trabaja con consultas más ligeras y se pueden lanzar en paralelo,
 * lo que devuelve muchos más negocios y en menos tiempo.
 *
 * - El sector elegido es un filtro ESTRICTO en su propia consulta.
 * - El bloque de pequeños negocios y autónomos va en consultas aparte y solo se añade
 *   cuando no hay un sector concreto que respetar.
 */
function buildOverpassQueries(cat, lat, lon, radiusKm, pool, incluirPequenos = false) {
  const radius = Math.max(100, Math.round(radiusKm * 1000)); // Overpass trabaja en metros
  const sectorEstricto = !SECTORES_AMPLIOS.includes(cat.id);

  const consultas = [];
  const sector = clausesDeEtiquetas(cat.tags, radius, lat, lon);
  if (sector.length) {
    consultas.push(`[out:json][timeout:60];(\n${sector.join('\n')}\n);out center ${pool};`);
  }

  if (incluirPequenos && !sectorEstricto) {
    // Cada bloque por separado: consultas mas rapidas y se ejecutan en paralelo
    const bloques = [
      { shop: ['*'] },
      { craft: ['*'] },
      { office: ['*'] },
      { healthcare: ['*'] },
      { service: ['*'] },
      { amenity: ['*'] },
      { building: ['commercial', 'retail', 'office', 'service', 'craft'] }
    ];
    for (const bloque of bloques) {
      const claves = clausesDeEtiquetas(bloque, radius, lat, lon);
      if (claves.length) {
        consultas.push(`[out:json][timeout:60];(\n${claves.join('\n')}\n);out center ${pool};`);
      }
    }
  }

  return consultas;
}

/** Consulta única (se mantiene por compatibilidad) */
function buildOverpassQuery(cat, lat, lon, radiusKm, pool, incluirPequenos = false) {
  return buildOverpassQueries(cat, lat, lon, radiusKm, pool, incluirPequenos)[0];
}

async function overpass(query, maxEndpoints = OVERPASS.length, timeoutMs = 45000) {
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
    }, { intentos: 1, timeoutMs }).then((json) => {
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
async function nominatimPois({ center, category, limit, timeoutMs = 12000 }) {
  const cat = categoryById(category);
  const palabra = (cat.id === 'todos' ? 'comercio' : cat.label.toLowerCase().split(' ')[0]);
  const lugar = String(center.label || '').split(',').slice(0, 2).join(',').trim();
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&extratags=1&limit=${Math.min(50, limit)}&countrycodes=es&q=${encodeURIComponent(`${palabra} ${lugar}`)}`;
  const data = await fetchRetry(url, { headers: { 'User-Agent': userAgent(), 'Accept-Language': 'es' } }, { intentos: 2, timeoutMs });
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
async function refineCenter(center, query, timeoutMs = 12000) {
  const palabra = String(query || '').split(',')[0].trim();
  if (!palabra) return center;
  const re = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const q = `[out:json][timeout:20];node["place"~"^(city|town|village|hamlet)$"]["name"~"^${re}$",i](around:30000,${center.lat},${center.lon});out center 5;`;
  try {
    const json = await overpass(q, 2, timeoutMs);
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
 * Lanza varias consultas de Overpass EN PARALELO y fusiona los resultados.
 * Cada consulta es ligera, así que el servidor responde mucho antes que con una
 * consulta gigante, y entre todas se conocen muchos más negocios.
 */
async function consultarEnParalelo(consultas, { timeoutMs = 12000, maxSimultaneas = 3, presupuestoMs = 60000 } = {}) {
  const elementos = [];
  const inicio = Date.now();

  // Se lanzan por tandas y con un presupuesto de tiempo: Chromium (el proceso principal
  // de Electron) limita las conexiones por servidor y serializa las peticiones al mismo
  // host, de modo que lanzar todas las consultas a la vez solo añade espera.
  for (let i = 0; i < consultas.length; i += maxSimultaneas) {
    if (Date.now() - inicio > presupuestoMs) {
      if (process.env.IASOLGES_DEBUG) {
        console.log(`[overpass] presupuesto de tiempo alcanzado, se omiten ${consultas.length - i} consultas`);
      }
      break;
    }
    const tanda = consultas.slice(i, i + maxSimultaneas);
    const restantes = presupuestoMs - (Date.now() - inicio);
    const resultados = await Promise.allSettled(
      tanda.map((q, k) => overpass(q, 2 + ((i + k) % 2), Math.min(timeoutMs, Math.max(8000, restantes))))
    );
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value?.elements?.length) elementos.push(...r.value.elements);
    }
  }
  return elementos;
}

/**
 * Búsqueda completa de clientes potenciales alrededor de un punto.
 * Devuelve hasta `limit` clientes, ordenados por cercanía, e informa de cuántos
 * encontró en total para que se vea si el resultado está recortado.
 */
async function search({ query, lat, lon, radius = 5, category = 'todos', limit, incluirPequenos = true }) {
  // Cantidad máxima de clientes que se muestran (10 a 300)
  const maxClientes = Math.min(300, Math.max(10, parseInt(limit, 10) || 60));
  // Se piden bastantes elementos por consulta para conocer de sobra cuántos negocios
  // hay en la zona y poder devolver los más cercanos hasta el límite pedido.
  const pool = Math.min(1000, Math.max(maxClientes * 4, 400));

  // Reloj global: ninguna fase puede dejar la pantalla esperando indefinidamente
  const inicio = Date.now();
  const restante = () => Math.max(4000, 90000 - (Date.now() - inicio));

  let center = { lat, lon, label: query || 'Punto seleccionado' };
  let candidatos = [];
  if (query && (lat === undefined || lon === undefined)) {
    candidatos = await geocode(query, Math.min(20000, restante()));
    if (!candidatos.length) throw new Error(`No se ha encontrado la ubicación "${query}"`);
    const prioridad = { city: 0, town: 1, village: 2, municipality: 3, borough: 4, suburb: 5, quarter: 6, neighbourhood: 7, hamlet: 8, isolated_dwelling: 9, farm: 10 };
    const mejor = [...candidatos].sort((a, b) => (prioridad[a.type] ?? 11) - (prioridad[b.type] ?? 11))[0];
    center = await refineCenter({ lat: mejor.lat, lon: mejor.lon, label: mejor.label }, query, Math.min(15000, restante()));
  }

  const cat = categoryById(category);
  let consultas = buildOverpassQueries(cat, center.lat, center.lon, radius, pool, incluirPequenos);
  let motor = 'overpass';
  let elementos = [];

  try {
    elementos = await consultarEnParalelo(consultas, { presupuestoMs: Math.min(60000, restante()) });
    if (!elementos.length && !SECTORES_AMPLIOS.includes(cat.id)) {
      // sin resultados en el radio: ampliamos automáticamente una vez
      consultas = buildOverpassQueries(cat, center.lat, center.lon, Math.min(radius * 2.5, 40), pool, incluirPequenos);
      elementos = await consultarEnParalelo(consultas, { presupuestoMs: Math.min(60000, restante()) });
    }
  } catch (e) {
    motor = 'nominatim';
  }

  // Plan B: si los servidores de Overpass no dan nada, se usa Nominatim por palabras clave
  if (!elementos.length) {
    try {
      elementos = await nominatimPois({ center, category, limit: Math.min(400, pool), timeoutMs: Math.min(15000, restante()) });
      if (elementos.length) motor = 'nominatim';
    } catch (_) { /* sin alternativas disponibles */ }
  }

  // Normalización de coordenadas
  elementos = elementos.map((el) => {
    const lat2 = el.lat ?? el.center?.lat;
    const lon2 = el.lon ?? el.center?.lon;
    return { ...el, lat: lat2, lon: lon2 };
  }).filter((el) => typeof el.lat === 'number' && typeof el.lon === 'number'
    && (el.tags?.name || el.tags?.brand || el.tags?.operator));

  elementos.forEach((el) => { el.distanceKm = haversine(center, { lat: el.lat, lon: el.lon }); });

  // Orden por cercanía y eliminación de duplicados (mismo nombre en el mismo punto)
  elementos.sort((a, b) => a.distanceKm - b.distanceKm);
  const sinDuplicados = [];
  const firmas = new Set();
  for (const el of elementos) {
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