import React, { useEffect, useMemo, useRef, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { api, eur, haceCuanto } from '../lib/api.js';
import { BackHome, BarRow, Card, Empty, Field, Loading, Modal, useToast } from '../lib/ui.jsx';

const DEFAULT_CENTER = { lat: 38.4805, lon: -0.8033, label: 'Novelda, Alicante' };

export default function Localizacion({ settings, navigate, id }) {
  const { push } = useToast();
  const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState({ query: 'Novelda, Alicante', category: 'todos', radius: 3, limit: 60, incluirPequenos: true });
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [areaAbierta, setAreaAbierta] = useState(false);
  const [sel, setSel] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [objetivo, setObjetivo] = useState('');
  const [guardados, setGuardados] = useState([]);
  const [segundos, setSegundos] = useState(0);
  const panelRef = useRef(null);

  useEffect(() => {
    api.customers.categories().then(setCategorias).catch((e) => push(e.message, 'error'));
    api.db.clientes.all().then((c) => setGuardados(c)).catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!buscando) return undefined;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [buscando]);

  const buscar = async () => {
    // El area de trabajo (mapa + listado) se abre al instante, antes de tener datos
    setAreaAbierta(true);
    setBuscando(true);
    setAnalisis(null);
    try {
      const r = await api.customers.search(form);
      setResultado(r);
      setCenter(r.center);
      setSel([]);
      push(r.truncado
        ? `${r.clientes.length} clientes de ${r.total} encontrados (máximo configurado: ${r.limite})`
        : `${r.clientes.length} negocios analizados en ${r.categoria.label}`, 'success');
    } catch (e) {
      push(e.message, 'error', 7000);
    } finally {
      setBuscando(false);
    }
  };

  const filtrados = useMemo(() => {
    if (!resultado) return [];
    const q = filtro.toLowerCase();
    return resultado.clientes.filter((c) =>
      !q || c.nombre.toLowerCase().includes(q) || (c.categoria || '').toLowerCase().includes(q) || c.direccion.toLowerCase().includes(q));
  }, [resultado, filtro]);

  const toggle = (c) => setSel((prev) => (prev.find((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]));

  const seleccionarTodos = () => setSel(sel.length === filtrados.length ? [] : filtrados);

  const guardar = async () => {
    if (!sel.length) return push('Selecciona al menos un cliente', 'warning');
    try {
      const recs = await api.customers.save(sel, { campanha: form.query, categoriaBusqueda: form.category });
      setGuardados((g) => [...recs, ...g]);
      push(`${recs.length} clientes guardados`, 'success');
      setSel([]);
    } catch (e) { push(e.message, 'error'); }
  };

  const analizarIA = async () => {
    if (!resultado?.clientes.length) return push('Realiza primero una búsqueda', 'warning');
    setAnalizando(true);
    try {
      const prompt = await api.customers.analysisPrompt({ resultado, objetivo, servicio: form.category });
      const res = await api.ai.complete({
        prompt,
        system: 'Eres un consultor comercial experto en venta de servicios digitales en Espana. Respondes solo con JSON valido.',
        provider: settings?.provider,
        model: settings?.models?.[settings?.provider]
      });
      const json = parseJSON(res.text);
      setAnalisis(json || { resumen: res.text });
      if (!json) push('El modelo no devolvio un JSON valido: se muestra su respuesta en texto.', 'warning');
    } catch (e) {
      push(e.message, 'error', 7000);
    } finally {
      setAnalizando(false);
    }
  };

  const irAPresupuesto = () => {
    const clientes = sel.length ? sel : (guardados.length ? guardados : resultado?.clientes?.slice(0, 5) || []);
    sessionStorage.setItem('iasolges.clientes.presupuesto', JSON.stringify(clientes));
    navigate('presupuestos');
  };

  return (
    <div className="stack">
      <BackHome extra={<span className="chip primary">{sel.length} seleccionados</span>} />

      <Card icon="🎯" title="Buscador de clientes en el mapa" subtitle="Localiza negocios reales de OpenStreetMap y calcula la probabilidad de contratacion por medios de análisis">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(200px, 2fr) minmax(150px, 1fr) minmax(180px, 1fr) 282px auto', gap: 12, alignItems: 'end' }}>
          <Field label="Ubicación, dirección o negocio">
            <input type="text" value={form.query} placeholder="Ej. Benidorm, Alicante o Calle Mayor 1"
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && buscar()} />
          </Field>
          <Field label="Sector">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label={`Radio de análisis: ${form.radius} km`}>
            <input type="range" min="1" max="25" step="1" value={form.radius}
              onChange={(e) => setForm({ ...form, radius: Number(e.target.value) })} />
          </Field>
          <Field label={`Máximo de clientes: ${form.limit}`}>
            <div className="row row-tight" style={{ flexWrap: 'nowrap' }}>
              <input type="number" min="10" max="300" step="5" value={form.limit} title="De 10 a 300 clientes por búsqueda"
                style={{ width: 78, flex: '0 0 78px' }}
                onChange={(e) => setForm({ ...form, limit: Math.min(300, Math.max(10, Number(e.target.value) || 10)) })}
                onKeyDown={(e) => e.key === 'Enter' && buscar()} />
              {[20, 50, 100, 200].map((n) => (
                <button key={n} type="button" className={`chip ${form.limit === n ? 'on' : ''}`} title={`${n} clientes maximos`}
                  onClick={() => setForm({ ...form, limit: n })}>{n}</button>
              ))}
            </div>
          </Field>
          <div className="row row-tight">
            <button className="btn primary lg" onClick={buscar} disabled={buscando}>
              {buscando ? <span className="spinner" /> : '🔍'} Buscar
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <label className="check nowrap" title="Añade comercios, talleres, profesiones y autónomos con cualquier tipo de etiqueta">
            <input type="checkbox" checked={form.incluirPequenos}
              onChange={(e) => setForm({ ...form, incluirPequenos: e.target.checked })} />
            🏪 Incluir pequeñas empresas y autónomos
          </label>
          <input type="text" value={objetivo} placeholder="Objetivo comercial para el análisis IA (Ej.: vender webs a negocios sin presencia digital)"
            onChange={(e) => setObjetivo(e.target.value)} style={{ flex: 1 }} />
          <span className="tiny muted">
            Mapas y datos: OpenStreetMap + Nominatim + Overpass. Puedes hacer <b>clic en el mapa</b> para mover el centro de búsqueda.
          </span>
        </div>
      </Card>


      {(resultado || areaAbierta) && (
        <>
          <div className="split" style={{ gridTemplateColumns: '1fr 430px' }}>
            <Card bodyClass="tight" title={resultado ? `Mapa · ${resultado.clientes.length} resultados` : 'Mapa de clientes'} icon="🗺️"
              subtitle={resultado ? `${resultado.center.label}${resultado.incluidosPequenos ? ' · incluye pequeñas empresas y autónomos' : ''}${resultado.truncado ? ` · mostrando el máximo configurado (${resultado.limite}) de ${resultado.total} negocios` : ''}` : 'Preparado: pulsa Buscar para localizar clientes'}
              actions={
                <>
                  <button className="btn sm" onClick={analizarIA} disabled={analizando || !resultado}>
                    {analizando ? <span className="spinner" /> : '🤖'} Análisis IA
                  </button>
                  <button className="btn sm" onClick={guardar} disabled={!resultado}>💾 Guardar ({sel.length})</button>
                  <button className="btn primary sm" onClick={irAPresupuesto} disabled={!resultado}>📄 Presupuestar</button>
                </>
              }>
              {!resultado && (
                <div style={{ position: 'relative', height: 560 }}>
                  <MapView
                    center={center}
                    zoom={13}
                    radiusKm={form.radius}
                    clientes={[]}
                    selected={[]}
                    height={560}
                    dark={['grafito', 'medianoche'].includes(settings?.theme)}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 500, display: 'grid', placeItems: 'center',
                    background: 'color-mix(in srgb, var(--surface) 78%, transparent)', backdropFilter: 'blur(2px)'
                  }}>
                    <div className="card card-body center" style={{ boxShadow: 'var(--shadow-lg)', maxWidth: 420 }}>
                      <span className="spinner lg" />
                      <div className="bold" style={{ marginTop: 10 }}>
                        Buscando clientes… {segundos}s
                      </div>
                      <div className="small muted" style={{ marginTop: 6 }}>
                        Localizando negocios reales de OpenStreetMap en un radio de {form.radius} km y
                        calculando la probabilidad de cada uno.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {resultado && (
              <MapView
                center={center}
                zoom={13}
                radiusKm={resultado.radio}
                clientes={resultado.clientes}
                selected={sel}
                onSelectClient={toggle}
                onClickMap={async (pt) => {
                  const rev = await api.customers.reverse(pt.lat, pt.lon).catch(() => null);
                  setCenter({ lat: pt.lat, lon: pt.lon, label: rev?.label || 'Punto seleccionado' });
                  push('Centro movido. Pulsa Buscar para actualizar los resultados.', 'info');
                }}
                dark={['grafito', 'medianoche'].includes(settings?.theme)}
                fitKey={resultado.clientes.length}
                height={560}
              />
              )}
            </Card>

            <Card bodyClass="tight" title="Listado de posibles clientes" icon="🏪"
              actions={<button className="btn sm ghost" onClick={seleccionarTodos}>{sel.length === filtrados.length ? 'Quitar todo' : 'Seleccionar todo'}</button>}>
              <input type="search" placeholder="Filtrar por nombre, sector o dirección" value={filtro}
                onChange={(e) => setFiltro(e.target.value)} style={{ marginBottom: 8 }} disabled={!resultado} />
              <div className="client-list">
                {!resultado && (
                  <Empty icon="⏳" title="Area de trabajo lista" text="Pulsa Buscar para localizar los clientes de esta zona." />
                )}
                {resultado && filtrados.length === 0 && (
                  resultado.total === 0 ? (
                    <Empty icon="📡" title="Los servidores de mapas no han devuelto datos"
                      text="Puede ser que OpenStreetMap esté saturado en este momento. Amplía el radio o repite la búsqueda en unos segundos." />
                  ) : (
                    <Empty icon="🔍" title="Sin resultados" text="Amplía el radio, sube el máximo de clientes o cambia el sector." />
                  )
                )}
                {filtrados.map((c) => (
                  <div key={c.id} className={`client-row ${sel.find((s) => s.id === c.id) ? 'selected' : ''}`} onClick={() => toggle(c)}>
                    <input type="checkbox" checked={Boolean(sel.find((s) => s.id === c.id))} onChange={() => toggle(c)} onClick={(e) => e.stopPropagation()} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name truncate">{c.nombre}</div>
                      <div className="meta truncate">{c.categoria} · {c.distanciaKm} km</div>
                      <div className="row row-tight tiny muted" style={{ marginTop: 2 }}>
                        {c.contacto.website && <span title={c.contacto.website}>🌐 web</span>}
                        {c.contacto.phone && <span>📞 {c.contacto.phone}</span>}
                        {!c.contacto.website && <span style={{ color: 'var(--success)' }}>✓ oportunidad sin web</span>}
                      </div>
                    </div>
                    <div>
                      <div className="prob" style={{ color: c.probabilidad >= 70 ? 'var(--success)' : c.probabilidad >= 45 ? 'var(--warning)' : 'var(--danger)' }}>
                        {c.probabilidad}%
                      </div>
                      <button className="btn ghost sm tiny" onClick={(e) => { e.stopPropagation(); setDetalle(c); }}>análisis</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {analisis && (
            <Card icon="🤖" title="Análisis comercial con IA" subtitle="Segmentacion, priorizacion y estrategia de venta">
              {analisis.resumen && <p className="soft">{analisis.resumen}</p>}
              <div className="grid grid-2">
                {(analisis.segmentos || []).map((s, i) => (
                  <div key={i} className="card card-body" style={{ boxShadow: 'none' }}>
                    <b>{s.segmento}</b>
                    <div className="small soft">{s.estrategia}</div>
                    <div className="row row-tight" style={{ marginTop: 6 }}>
                      {(s.clientes || []).slice(0, 6).map((n) => <span key={n} className="chip static">{n}</span>)}
                    </div>
                  </div>
                ))}
              </div>
              {(analisis.priorizados || []).length > 0 && (
                <>
                  <div className="divider" />
                  <h3>Clientes prioritarios</h3>
                  {analisis.priorizados.map((p, i) => (
                    <div key={i} className="link-row">
                      <div className="ico">🔥</div>
                      <div style={{ flex: 1 }}>
                        <div className="name">{p.nombre}</div>
                        <div className="meta">{p.motivo} → {p.accion}</div>
                      </div>
                      <span className="chip primary">{p.probabilidad}%</span>
                    </div>
                  ))}
                </>
              )}
              {(analisis.ofertas || []).length > 0 && (
                <>
                  <div className="divider" />
                  <div className="grid grid-2">
                    {analisis.ofertas.map((o, i) => (
                      <div key={i} className="alert info">
                        <div>
                          <b>{o.nombre}</b> — {eur(o.precioOrientativo)}
                          <div className="tiny">{(o.incluye || []).join(' · ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          <Card icon="🗃️" title={`Clientes guardados (${guardados.length})`} subtitle="Base comercial disponible para presupuestos">
            {guardados.length === 0 ? (
              <Empty icon="💾" title="Ningun cliente guardado" text="Selecciona resultados y pulsa Guardar." />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Cliente</th><th>Sector</th><th>Dirección</th><th>Contacto</th><th>Prob.</th><th>Estado</th><th /></tr>
                  </thead>
                  <tbody>
                    {guardados.map((c) => (
                      <tr key={c.id}>
                        <td><b>{c.nombre}</b><div className="tiny muted">{haceCuanto(c.createdAt)}</div></td>
                        <td>{c.categoria}</td>
                        <td className="small">{c.direccion}</td>
                        <td className="small">{c.contacto?.phone || '—'}<div className="tiny muted truncate" style={{ maxWidth: 160 }}>{c.contacto?.website || 'sin web'}</div></td>
                        <td><b>{c.probabilidad}%</b></td>
                        <td><span className="chip">{c.estado}</span></td>
                        <td>
                          <button className="btn sm ghost" title="Ver análisis" onClick={() => setDetalle(c)}>👁️</button>
                          <button className="btn sm ghost" title="Eliminar" onClick={async () => {
                            await api.db.clientes.remove(c.id);
                            setGuardados((g) => g.filter((x) => x.id !== c.id));
                          }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {!buscando && !resultado && (
        <Card>
          <Empty icon="📍" title="Busca clientes en el mapa"
            text="Introduce una ubicación y un sector. El sistema listara los negocios del area con sus datos de contacto y la probabilidad de contratacion segun distintos medios de análisis."
            action={<button className="btn primary" onClick={buscar}>🔍 Empezar la búsqueda</button>} />
        </Card>
      )}

      <Modal open={Boolean(detalle)} title={`Análisis · ${detalle?.nombre || ''}`} onClose={() => setDetalle(null)} wide
        footer={<>
          <button className="btn" onClick={() => setDetalle(null)}>Cerrar</button>
          <button className="btn primary" onClick={() => { setDetalle(null); irAPresupuesto(); }}>Crear presupuesto con este cliente</button>
        </>}>
        {detalle && (
          <div className="stack">
            <div className="row">
              <span className="chip primary">{detalle.categoria}</span>
              <span className="chip">{detalle.distanciaKm} km</span>
              <span className={`chip ${detalle.probabilidad >= 70 ? 'success' : detalle.probabilidad >= 45 ? 'warning' : 'danger'}`}>
                Prioridad {detalle.prioridad}
              </span>
              <span className="chip info">Ticket estimado {eur(detalle.ticketEstimado)}</span>
            </div>
            <p className="soft">{detalle.direccion}</p>
            <h3>Porcentaje por medio de análisis</h3>
            {detalle.opciones.map((o) => <BarRow key={o.medio} name={o.medio} value={o.porcentaje} />)}
            <div className="alert info">
              <div><b>Probabilidad global de contratacion: {detalle.probabilidad}%</b>
                <div className="small">Se obtiene ponderando cercanía (30%), encaje del sector (20%), oportunidad de digitalizacion (20%), capacidad de inversión (20%) y prioridad de la lista (10%).</div>
              </div>
            </div>
            <h3>Datos de contacto</h3>
            <dl className="kv">
              <dt>Teléfono</dt><dd>{detalle.contacto?.phone || 'No disponible'}</dd>
              <dt>Web</dt><dd>{detalle.contacto?.website ? <a href={detalle.contacto.website} onClick={(e) => { e.preventDefault(); api.openExternal(detalle.contacto.website); }}>{detalle.contacto.website}</a> : 'Sin web (oportunidad)'}</dd>
              <dt>Email</dt><dd>{detalle.contacto?.email || 'No disponible'}</dd>
              <dt>Horario</dt><dd className="small">{detalle.contacto?.openingHours || 'No disponible'}</dd>
              <dt>Redes</dt><dd>{(detalle.contacto?.socials || []).map((s) => s.red).join(', ') || 'No detectadas'}</dd>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

function parseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { /* ignore */ }
  const m = text.match(/```json([\s\S]*?)```/) || text.match(/```([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch (_) { return null; } }
  const f = text.indexOf('{'); const l = text.lastIndexOf('}');
  if (f !== -1 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch (_) { return null; } }
  return null;
}