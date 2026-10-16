import React, { useEffect, useState } from 'react';
import { api, fechaHora, haceCuanto } from '../lib/api.js';
import { BackHome, Card, Empty, Field, Loading, Meter, Modal, Tabs, useToast } from '../lib/ui.jsx';

const SEV_COLOR = { critica: '#b91c1c', alta: '#ea580c', media: '#ca8a04', leve: '#0891b2', info: '#64748b' };
const SEV_LABEL = { critica: 'Critica', alta: 'Alta', media: 'Media', leve: 'Leve', info: 'Informativa' };

export default function Legal({ id, settings, navigate }) {
  const { push } = useToast();
  const [tab, setTab] = useState(id ? 'informe' : 'analizar');
  const [analisis, setAnalisis] = useState(null);
  const [informes, setInformes] = useState([]);
  const [normativa, setNormativa] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [hallazgo, setHallazgo] = useState(null);
  const [form, setForm] = useState({ modo: 'url', url: '', proyectoId: '', titulo: '', texto: '', documentos: [] });

  const cargar = async () => {
    setLoading(true);
    try {
      const [inf, nor, pro] = await Promise.all([api.db.analyses.all(), api.legal.normativa(), api.db.proyectos.all()]);
      setInformes(inf); setNormativa(nor); setProyectos(pro);
      if (id) {
        const a = inf.find((x) => x.id === id);
        if (a) setAnalisis(a);
      }
    } catch (e) { push(e.message, 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const analizar = async () => {
    setTrabajando(true);
    try {
      let r;
      const opts = { provider: settings?.provider, model: settings?.models?.[settings?.provider], agent: settings?.agent || 'plan' };
      if (form.modo === 'url') {
        if (!form.url.trim()) return push('Introduce una URL o dominio', 'warning');
        r = await api.legal.analyzeUrl({ url: form.url.trim(), ...opts });
      } else if (form.modo === 'proyecto') {
        const p = proyectos.find((x) => x.id === form.proyectoId);
        if (!p) return push('Selecciona un proyecto generado', 'warning');
        r = await api.legal.analyzeProject({ projectId: p.id, dir: p.carpeta, ...opts });
      } else {
        const texto = `${form.texto}\n\n${form.documentos.map((d) => `--- ${d.nombre} ---\n${d.texto}`).join('\n\n')}`;
        if (!texto.trim()) return push('Aporta un documento o texto para analizar', 'warning');
        r = await api.legal.analyzeText({ titulo: form.titulo || 'Documento ANALIZADO', texto, ...opts });
      }
      setAnalisis(r);
      setTab('informe');
      await cargar();
      push(`Análisis completado: ${r.veredicto?.nivel} (${r.score}%)`, r.score >= 70 ? 'success' : 'warning', 6000);
    } catch (e) {
      push(e.message, 'error', 9000);
    } finally { setTrabajando(false); }
  };

  const elegirArchivos = async () => {
    try {
      const files = await api.legal.pickFile();
      if (files.length) setForm((f) => ({ ...f, documentos: [...f.documentos, ...files] }));
    } catch (e) { push(e.message, 'error'); }
  };

  if (loading) return <Loading text="Cargando modulos legales..." />;

  const incumplimientos = (analisis?.hallazgos || []).filter((h) => h.estado === 'incumplimiento');
  const correctos = (analisis?.hallazgos || []).filter((h) => h.estado !== 'incumplimiento');

  return (
    <div className="stack">
      <BackHome extra={analisis && <span className="chip" style={{ background: `${analisis.veredicto?.color}1a`, color: analisis.veredicto?.color }}>{analisis.veredicto?.nivel}</span>} />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'analizar', label: 'Nuevo análisis', icon: '🔍' },
          { id: 'informes', label: 'Informes', icon: '📑', count: informes.length },
          ...(analisis ? [{ id: 'informe', label: 'Informe actual', icon: '📊' }] : []),
          { id: 'normativa', label: 'Normativa', icon: '📚' }
        ]}
      />

      {tab === 'analizar' && (
        <>
          <Card icon="⚖️" title="Análisis legal con IA" subtitle="Comprueba desde las cookies hasta el último detalle y devuelve el problema y su solución">
            <div className="row row-tight" style={{ marginBottom: 14 }}>
              {[['url', '🌐 Web / URL'], ['proyecto', '🏗️ Proyecto generado'], ['documento', '📄 Documento o texto']].map(([idv, label]) => (
                <button key={idv} className={`btn sm ${form.modo === idv ? 'primary' : ''}`} onClick={() => setForm({ ...form, modo: idv })}>{label}</button>
              ))}
            </div>

            {form.modo === 'url' && (
              <Field label="URL a analizar" hint="Se comprueban: HTTPS, cookies y consentimiento, política de privacidad, aviso legal, identificacion del titular, terms, cabeceras de seguridad, accesibilidad, SEO, contenido mixto y mucho mas.">
                <input type="text" placeholder="https://www.ejemplo.es" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && analizar()} />
              </Field>
            )}

            {form.modo === 'proyecto' && (
              <Field label="Proyecto generado en La Fábrica" hint="Se auditan secretos en el código, consentimiento de cookies, políticas, licencia, documentación y uso de terceros.">
                <select value={form.proyectoId} onChange={(e) => setForm({ ...form, proyectoId: e.target.value })}>
                  <option value="">— Selecciona un proyecto —</option>
                  {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.tipo}</option>)}
                </select>
              </Field>
            )}

            {form.modo === 'documento' && (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <button className="btn sm" onClick={elegirArchivos}>📂 Adjuntar documento</button>
                  {form.documentos.map((d, i) => (
                    <span key={i} className="chip static">
                      {d.nombre}
                      <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => setForm({ ...form, documentos: form.documentos.filter((_, j) => j !== i) })}>✕</button>
                    </span>
                  ))}
                </div>
                <Field label="Titulo del análisis"><input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Contrato de arrendamiento" /></Field>
                <Field label="Texto a analizar" hint="Pega aqui cualquier documento, clausula o contenido. Puedes combinarlo con los archivos adjuntos.">
                  <textarea rows={8} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} placeholder="Pega el contenido del documento…" />
                </Field>
              </>
            )}

            <div className="row">
              <button className="btn primary lg" onClick={analizar} disabled={trabajando}>
                {trabajando ? <><span className="spinner" /> Analizando con IA...</> : '⚖️ Ejecutar análisis legal'}
              </button>
              <span className="small muted">Modelo: {settings?.provider} · {settings?.models?.[settings?.provider] || ''}</span>
            </div>
          </Card>

          <Card icon="📚" title="Que se comprueba" subtitle="ElAnalisis automático mas la revisión profunda de la IA">
            <div className="grid grid-3">
              {[
                ['🍪', 'Cookies', 'Banner, consentimiento previo, política, rechazo, terceros, retirada del consentimiento.'],
                ['🛡️', 'Protección de datos', 'Política de privacidad, info al interesado, bases juridicas, contratos con encargados y transferencias.'],
                ['📜', 'Información legal', 'Aviso legal, identificacion del titular (CIF/NIF y domicilio), condiciones de uso.'],
                ['🛒', 'Contratacion', 'Terminos, precios, forma de pago, desistimiento, garantia, derechos del consumidor.'],
                ['🔐', 'Seguridad', 'HTTPS, HSTS, CSP, mixt content, secretos en código, prácticas seguras.'],
                ['♿', 'Accesibilidad', 'RD 1112/2018: lang, alt, foco, contraste, navegacion por teclado.'],
                ['🔎', 'SEO', 'Metadatos, canonical, Open Graph, datos estructurados, sitemap y robots.'],
                ['⚖️', 'Propiedad industrial', 'Licencias de terceros, atribuciones, copyleft, marcas y nombre comercial.'],
                ['📞', 'Comunicaciones', 'LSSI-CE, LAL, información al usuario, publicidad y bajas.']
              ].map(([i, t, d]) => (
                <div key={t} className="card card-body" style={{ boxShadow: 'none' }}>
                  <b>{i} {t}</b>
                  <div className="small soft">{d}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'informes' && (
        <Card icon="📑" title="Informes legales" subtitle="Historial completo de auditorias">
          {informes.length === 0 ? (
            <Empty icon="⚖️" title="Sin análisis" text="Analiza una web, un proyecto o un documento." action={<button className="btn primary" onClick={() => setTab('analizar')}>Nuevo análisis</button>} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Objetivo</th><th>Tipo</th><th>Fecha</th><th>Puntuacion</th><th>Veredicto</th><th>Hallazgos</th><th /></tr></thead>
                <tbody>
                  {informes.map((a) => (
                    <tr key={a.id} className="clickable" onClick={() => { setAnalisis(a); setTab('informe'); }}>
                      <td className="truncate" style={{ maxWidth: 280 }}><b>{a.objetivo}</b></td>
                      <td><span className="chip">{a.tipo}</span></td>
                      <td className="small">{haceCuanto(a.createdAt)}</td>
                      <td style={{ width: 130 }}><div className="row row-tight"><span className="bold">{a.score}%</span><div style={{ flex: 1 }}><Meter value={a.score} /></div></div></td>
                      <td><span className="chip" style={{ background: `${a.veredicto?.color}1a`, color: a.veredicto?.color }}>{a.veredicto?.nivel}</span></td>
                      <td>{a.hallazgos.filter((h) => h.estado === 'incumplimiento').length} / {a.hallazgos.length}</td>
                      <td><button className="btn sm ghost" title="Eliminar" onClick={async (e) => {
                        e.stopPropagation();
                        await api.db.analyses.remove(a.id);
                        setInformes((l) => l.filter((x) => x.id !== a.id));
                      }}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'informe' && analisis && (
        <>
          <Card>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="truncate">{analisis.objetivo}</h2>
                <div className="small muted">{analisis.tipo} · {fechaHora(analisis.createdAt)} · modelo {analisis.ai?.model || 'OpenCode'}</div>
              </div>
              <div className="row">
                <div className="right">
                  <div className="value" style={{ fontSize: 30, fontWeight: 700, color: analisis.veredicto?.color }}>{analisis.score}%</div>
                  <div className="tiny muted">cumplimiento</div>
                </div>
                <span className="chip" style={{ background: `${analisis.veredicto?.color}1a`, color: analisis.veredicto?.color, fontSize: 13 }}>{analisis.veredicto?.nivel}</span>
              </div>
            </div>
            <div style={{ marginTop: 12 }}><Meter value={analisis.score} big /></div>
            {analisis.resumenIA && <p className="soft" style={{ marginTop: 14 }}>{analisis.resumenIA}</p>}
            {analisis.veredicto?.resumen && !analisis.resumenIA && <p className="soft">{analisis.veredicto.resumen}</p>}
          </Card>

          <div className="grid" style={{ gridTemplateColumns: '1fr 320px' }}>
            <div className="stack">
              <Card icon="⚠️" title={`Incumplimientos y recomendaciones (${incumplimientos.length})`} subtitle="Pulsa cualquier hallazgo para ver el problema y la solución">
                {incumplimientos.length === 0 ? <Empty icon="✅" title="Sin incumplimientos" text="Todo lo comprobado cumple los requisitos." /> : (
                  incumplimientos.map((h) => (
                    <div key={h.id} className="finding" onClick={() => setHallazgo(h)}>
                      <div className="sev" style={{ background: SEV_COLOR[h.severidad] || SEV_COLOR.info }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row row-tight">
                          <span className="sev-badge" style={{ background: `${SEV_COLOR[h.severidad]}1a`, color: SEV_COLOR[h.severidad] }}>{SEV_LABEL[h.severidad] || h.severidad}</span>
                          <span className="chip static">{h.categoria}</span>
                          {h.fuente === 'ia' && <span className="chip info static">IA</span>}
                        </div>
                        <div className="title">{h.nombre}</div>
                        <div className="desc truncate">{h.problema}</div>
                      </div>
                      <div className="arrow">›</div>
                    </div>
                  ))
                )}
              </Card>

              {correctos.length > 0 && (
                <Card icon="✅" title={`Aspectos correctos (${correctos.length})`}>
                  {correctos.map((h) => (
                    <div key={h.id} className="finding ok" onClick={() => setHallazgo(h)}>
                      <div className="sev" style={{ background: 'var(--success)' }} />
                      <div style={{ flex: 1 }}>
                        <div className="title">{h.nombre}</div>
                        <div className="desc">{h.solucion}</div>
                      </div>
                      <div className="arrow">›</div>
                    </div>
                  ))}
                </Card>
              )}
            </div>

            <div className="stack">
              <Card icon="🎯" title="Acciones prioritarias">
                {(analisis.acciones || []).length === 0 ? <Empty icon="🎯" title="Sin acciones" /> :
                  <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
                    {analisis.acciones.map((a, i) => <li key={i} style={{ marginBottom: 8 }}>{a}</li>)}
                  </ol>}
              </Card>
              <Card icon="⚠️" title="Avisos">
                <ul className="small soft" style={{ paddingLeft: 18 }}>
                  {(analisis.avisos || []).map((a, i) => <li key={i}>{a}</li>)}
                </ul>
                {analisis.errorIA && <div className="alert warn small"><div>La parte de IA no pudo completarse: {analisis.errorIA}. Se muestra el análisis estatico.</div></div>}
              </Card>
              <Card icon="📚" title="Normativa aplicable">
                <div className="stack-sm">
                  {normativa.map((n) => (
                    <a key={n.id} href={n.url} onClick={(e) => { e.preventDefault(); api.openExternal(n.url); }} className="link-row" style={{ padding: '6px 2px' }}>
                      <div className="ico">📖</div>
                      <div style={{ flex: 1 }}>
                        <div className="name small">{n.nombre}</div>
                        <div className="tiny muted">Articulos: {n.arts}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'normativa' && (
        <Card icon="📚" title="Normativa de referencia" subtitle="Documentación oficial que se aplica en los análisis">
          <div className="grid grid-2">
            {normativa.map((n) => (
              <div key={n.id} className="card card-body" style={{ boxShadow: 'none' }}>
                <b>{n.nombre}</b>
                <div className="small soft">Articulos destacados: {n.arts}</div>
                <a href={n.url} onClick={(e) => { e.preventDefault(); api.openExternal(n.url); }} className="small">Abrir texto oficial ↗</a>
              </div>
            ))}
          </div>
          <div className="alert warn" style={{ marginTop: 14 }}>
            <div>Este análisis es una orientacion técnica automatizada y <b>no sustituye al asesoramiento jurídico profesional</b>. Antes de publicar, valida las conclusiones con tu abogado.</div>
          </div>
        </Card>
      )}

      <Modal open={Boolean(hallazgo)} title={hallazgo?.nombre || ''} onClose={() => setHallazgo(null)} wide
        footer={<>
          {hallazgo?.enlaceUrl && <button className="btn" onClick={() => api.openExternal(hallazgo.enlaceUrl)}>📖 Ver norma oficial</button>}
          <button className="btn primary" onClick={() => setHallazgo(null)}>Entendido</button>
        </>}>
        {hallazgo && (
          <div className="stack">
            <div className="row row-tight">
              <span className="sev-badge" style={{ background: `${SEV_COLOR[hallazgo.severidad]}1a`, color: SEV_COLOR[hallazgo.severidad] }}>{SEV_LABEL[hallazgo.severidad] || hallazgo.severidad}</span>
              <span className="chip static">{hallazgo.categoria}</span>
              <span className="chip static">{hallazgo.fuente === 'ia' ? 'Detectado por IA' : 'Análisis automático'}</span>
            </div>
            <div>
              <h3>Problema detectado</h3>
              <p className="soft">{hallazgo.problema || 'Sin incidencias en este punto.'}</p>
              {hallazgo.impacto && <div className="alert warn small"><div><b>Impacto:</b> {hallazgo.impacto}</div></div>}
            </div>
            <div>
              <h3>Solución a emplear</h3>
              <p className="soft">{hallazgo.solucion}</p>
            </div>
            {hallazgo.referencia && (
              <div>
                <h3>Referencia normativa</h3>
                <p className="soft mono small">{hallazgo.referencia}</p>
                {hallazgo.enlaceUrl && <a href={hallazgo.enlaceUrl} onClick={(e) => { e.preventDefault(); api.openExternal(hallazgo.enlaceUrl); }}>{hallazgo.enlaceUrl}</a>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}