/**
 * IASolges.v2 - Presupuestos automaticos generados por IA
 */
const db = require('./db');
const engine = require('./ai/engine');
const { getSettings } = require('./config');

/** Catalogo de apartados/servicios que se pueden incluir en un presupuesto */
const SERVICIOS = [
  { id: 'web', label: 'Sitio web corporativo', precioHora: 45, horasEstimadas: 40, icono: '🌐' },
  { id: 'tienda', label: 'Tienda electronica (e-commerce)', precioHora: 50, horasEstimadas: 70, icono: '🛒' },
  { id: 'app-web', label: 'Aplicacion web a medida', precioHora: 55, horasEstimadas: 120, icono: '💻' },
  { id: 'app-movil', label: 'Aplicacion movil', precioHora: 60, horasEstimadas: 160, icono: '📱' },
  { id: 'agente-ia', label: 'Agente de IA / Asistente inteligente', precioHora: 65, horasEstimadas: 60, icono: '🤖' },
  { id: 'automatizacion', label: 'Automatizacion de procesos', precioHora: 55, horasEstimadas: 50, icono: '⚙️' },
  { id: 'api', label: 'Integraciones y APIs', precioHora: 55, horasEstimadas: 35, icono: '🔌' },
  { id: 'seo', label: 'SEO y posicionamiento', precioHora: 40, horasEstimadas: 30, icono: '📈' },
  { id: 'imagen', label: 'Marca e identidad visual', precioHora: 45, horasEstimadas: 25, icono: '🎨' },
  { id: 'hosting', label: 'Hosting, dominio y despliegue', precioHora: 30, horasEstimadas: 8, icono: '☁️' },
  { id: 'mantenimiento', label: 'Mantenimiento mensual', precioHora: 40, horasEstimadas: 8, icono: '🛠️' },
  { id: 'legal', label: 'Analisis legal y cumplimiento (RGPD/LSSI)', precioHora: 55, horasEstimadas: 14, icono: '⚖️' },
  { id: 'analitica', label: 'Panel de analitica y control', precioHora: 50, horasEstimadas: 24, icono: '📊' },
  { id: 'formacion', label: 'Formacion al equipo', precioHora: 35, horasEstimadas: 12, icono: '🎓' },
  { id: 'pack', label: 'Paquete completo IA + Web + App', precioHora: 60, horasEstimadas: 220, icono: '🚀' }
];

function servicioById(id) {
  return SERVICIOS.find((s) => s.id === id);
}

function nextNumber() {
  const year = new Date().getFullYear();
  const list = db.collection('presupuestos');
  const n = list.filter((p) => String(p.numero || '').includes(String(year))).length + 1;
  return `P-${year}-${String(n).padStart(3, '0')}`;
}

function buildPrompt({ clientes, necesidades, servicios,Extra = '', contexto }) {
  const cfg = getSettings().quote || {};
  const detalleClientes = clientes.map((c) => ({
    nombre: c.nombre, sector: c.categoria, direccion: c.direccion,
    web: c.contacto?.website || 'sin web', telefono: c.contacto?.phone || 'sin telefono',
    probabilidad: c.probabilidad, prioridad: c.prioridad
  }));
  const detalleServicios = servicios.map((id) => {
    const s = servicioById(id);
    return s ? `${s.label} (orientativo: ${s.horasEstimadas} h x ${s.precioHora} EUR/h)` : id;
  });

  return `Eres un consultor tecnico-economico experto en proyectos de software, IA y marketing digital en Espana.
Debes generar un PRESUPUESTO PROFESIONAL, REALISTA Y CONCRETO para este cliente(s).

DATOS DEL CLIENTE:
${JSON.stringify(detalleClientes, null, 1)}

NECESIDADES DETECTADAS POR EL USUARIO:
${necesidades || 'No indicadas: inferir del sector del cliente y del contexto'}

APARTADOS SELECCIONADOS QUE DEBEN INCLUYSE:
${detalleServicios.join('\n') || 'Selecciona los que mejor encajen con el cliente'}

${Extra}

CONTEXTO ADICIONAL: ${contexto || 'Ninguno'}

REGLAS:
- Idioma: espanol de Espana, tono profesional y comercial.
- Precios en euros (${cfg.currency || 'EUR'}), con IVA ${cfg.IVA || cfg.ivaRate || 21}% e IRPF ${cfg.IRPF || cfg.irpfRate || 15}% salvo autonomos.
- Margen objetivo sobre coste: ${cfg.margen || cfg.marginRate || 25}%.
- IMPORTANTE: entre 4 y 8 partidas, descripciones de 25 palabras como maximo y sin saltos de linea, para que quepa la respuesta completa.
- Plazo estimado realista en semanas y garantia de trabajo.
- Importes unitarios y totales coherentes (importe = horas x precio/hora).

Responde EXCLUSIVAMENTE con un JSON valido (sin texto antes ni despues):
{
  "titulo": "titulo comercial del presupuesto",
  "cliente": "nombre del cliente",
  "resumen": "resumen ejecutivo de lo que se va a hacer",
  "solucion": "descripcion de la solucion tecnica propuesta en 3-5 frases",
  "partidas": [
    { "concepto": "...", "descripcion": "...", "servicio": "web|app-web|agente-ia|...", "horas": 0, "precioHora": 0, "importe": 0 }
  ],
  "descuento": { "concepto": "descuento por volumen o lanzamiento", "porcentaje": 0, "importe": 0 },
  "plazo": "8-10 semanas",
  "formaPago": "50% a la firma, 30% entrega, 20% garantia",
  "garantia": "6 meses de garantia sobre el trabajo entregado",
  "incluye": ["..."],
  "noIncluye": ["..."],
  "condiciones": ["..."],
  "riesgos": ["..."],
  "notasIA": "comentario interno del asesor sobre la estrategia"
}`;
}

function normalizarNum(n, def = 0) {
  const v = typeof n === 'string' ? parseFloat(n.replace(/[^\d.,-]/g, '').replace(',', '.')) : parseFloat(n);
  return Number.isFinite(v) ? v : def;
}

function normalizarPartida(p, serviciosPorDefecto) {
  const servicio = p.servicio && servicioById(p.servicio) ? p.servicio : (serviciosPorDefecto[0] || 'web');
  const base = servicioById(servicio);
  const horas = normalizarNum(p.horas, base ? base.horasEstimadas : 20);
  const precioHora = normalizarNum(p.precioHora, base ? base.precioHora : 45);
  let importe = normalizarNum(p.importe, horas * precioHora);
  if (!importe) importe = horas * precioHora;
  return {
    concepto: p.concepto || base?.label || 'Servicio',
    descripcion: p.descripcion || '',
    servicio,
    horas,
    precioHora,
    importe: Math.round(importe * 100) / 100
  };
}

function calcular(presupuesto) {
  const cfg = getSettings().quote || {};
  const subtotal = presupuesto.partidas.reduce((acc, p) => acc + normalizarNum(p.importe), 0);
  const descPct = normalizarNum(presupuesto.descuento?.porcentaje);
  const descImp = presupuesto.descuento?.importe !== undefined
    ? normalizarNum(presupuesto.descuento.importe)
    : subtotal * (descPct / 100);
  const baseImponible = Math.max(0, subtotal - descImp);
  const ivaPct = normalizarNum(presupuesto.ivaPct, cfg.ivaRate ?? 21);
  const irpfPct = normalizarNum(presupuesto.irpfPct, cfg.irpfRate ?? 15);
  const iva = baseImponible * (ivaPct / 100);
  const irpf = baseImponible * (irpfPct / 100);
  const total = baseImponible + iva - irpf;

  const redondear = (n) => Math.round(n * 100) / 100;
  return {
    ...presupuesto,
    partidas: presupuesto.partidas.map((p) => normalizarPartida(p, presupuesto.servicios || [])),
    subtotal: redondear(subtotal),
    descuentoImporte: redondear(descImp),
    baseImponible: redondear(baseImponible),
    iva: redondear(iva),
    irpf: redondear(irpf),
    ivaPct,
    irpfPct,
    total: redondear(total),
    moneda: cfg.currency || 'EUR'
  };
}

async function generar(args, onEvent) {
  const {
    clientes = [], necesidades = '', servicios = [], Extra = '', contexto = '',
    provider, model, agent = 'plan'
  } = args;

  const servicioIds = servicios.length ? servicios : ['web'];
  const prompt = buildPrompt({ clientes, necesidades, servicios: servicioIds, Extra, contexto });

  const res = await engine.askJson(
    prompt,
    'Eres un consultor de proyectos tecnologicos. Respondes siempre en JSON valido.',
    { provider, model, agent }
  );

  let parsed = res.data;
  if (!parsed || !Array.isArray(parsed.partidas)) {
    parsed = {
      titulo: 'Presupuesto IA',
      cliente: clientes[0]?.nombre || 'Cliente',
      resumen: (res.text || '').slice(0, 800),
      partidas: servicioIds.map((id) => {
        const s = servicioById(id);
        return {
          concepto: s.label, descripcion: s.label, servicio: id,
          horas: s.horasEstimadas, precioHora: s.precioHora, importe: s.horasEstimadas * s.precioHora
        };
      })
    };
  }

  const cfg = getSettings().quote || {};
  const presupuesto = calcular({
    numero: nextNumber(),
    titulo: parsed.titulo || 'Presupuesto',
    cliente: parsed.cliente || (clientes[0]?.nombre ?? 'Cliente'),
    resumen: parsed.resumen || '',
    solucion: parsed.solucion || '',
    partidas: parsed.partidas,
    descuento: parsed.descuento || { porcentaje: 0, importe: 0 },
    plazo: parsed.plazo || '',
    formaPago: parsed.formaPago || '',
    garantia: parsed.garantia || '',
    incluye: parsed.incluye || [],
    noIncluye: parsed.noIncluye || [],
    condiciones: parsed.condiciones || [],
    riesgos: parsed.riesgos || [],
    notasIA: parsed.notasIA || '',
    servicios: servicioIds,
    clienteIds: clientes.map((c) => c.id),
    necesidades,
    validezDias: cfg.validityDays || 30,
    estado: 'borrador',
    ai: { provider, model, sessionId: res.sessionId || null, generadoEn: new Date().toISOString() }
  });

  presupuesto.expiraEn = new Date(Date.now() + (presupuesto.validezDias || 30) * 86400000).toISOString();
  presupuesto.totalHoras = presupuesto.partidas.reduce((a, p) => a + p.horas, 0);

  const record = db.insert('presupuestos', presupuesto);
  db.logEvent('presupuesto_generado', { id: record.id, total: record.total });
  if (onEvent) onEvent({ type: 'end', code: 0, text: res.text });
  return record;
}

module.exports = { SERVICIOS, generar, calcular, servicioById, nextNumber };