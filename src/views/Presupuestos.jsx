import React, { useEffect, useMemo, useState } from 'react';
import { api, eur, fecha, fechaHora, haceCuanto } from '../lib/api.js';
import { BackHome, Card, Empty, Field, Loading, Modal, Tabs, useToast } from '../lib/ui.jsx';

export default function Presupuestos({ id, settings, navigate }) {
  const { push } = useToast();
  const [tab, setTab] = useState(id ? 'detalle' : 'lista');
  const [lista, setLista] = useState([]);
  const [actual, setActual] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [selClientes, setSelClientes] = useState([]);
  const [form, setForm] = useState({ necesidades: '', servicios: ['web', 'agente-ia'], extra: '', contexto: '' });
  const [generando, setGenerando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verServicios, setVerServicios] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [ls, cs, sv] = await Promise.all([api.db.presupuestos.all(), api.db.clientes.all(), api.quotes.servicios()]);
      setLista(ls);
      setClientes(cs);
      setServicios(sv);
      const pre = sessionStorage.getItem('iasolges.clientes.presupuesto');
      if (pre) {
        try { setSelClientes(JSON.parse(pre)); } catch (_) { /* ignore */ }
        sessionStorage.removeItem('iasolges.clientes.presupuesto');
        setTab('nuevo');
      }
    } catch (e) {
      push(e.message, 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!id) return;
    api.db.presupuestos.get(id).then((p) => { if (p) { setActual(p); setTab('detalle'); } else push('Presupuesto no encontrado', 'error'); }).catch((e) => push(e.message, 'error'));
  }, [id]); // eslint-disable-line

  const totalCartera = useMemo(() => lista.reduce((a, p) => a + (p.total || 0), 0), [lista]);

  const generar = async () => {
    if (!selClientes.length && !form.necesidades) {
      return push('Selecciona al menos un cliente o describe las necesidades', 'warning');
    }
    setGenerando(true);
    try {
      const p = await api.quotes.generate({
        clientes: selClientes,
        necesidades: form.necesidades,
        servicios: form.servicios,
        Extra: form.extra,
        contexto: form.contexto,
        provider: settings?.provider,
        model: settings?.models?.[settings?.provider]
      });
      push(`Presupuesto ${p.numero} generado: ${eur(p.total, p.moneda)}`, 'success', 6000);
      await cargar();
      setActual(p);
      setTab('detalle');
    } catch (e) {
      push(e.message, 'error', 8000);
    } finally { setGenerando(false); }
  };

  if (loading) return <Loading text="Cargando presupuestos..." />;

  return (
    <div className="stack">
      <BackHome extra={<span className="chip primary">Cartera: {eur(totalCartera)}</span>} />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'lista', label: 'Todos los presupuestos', icon: '🗂️', count: lista.length },
          { id: 'nuevo', label: 'Crear con IA', icon: '🤖' },
          ...(actual ? [{ id: 'detalle', label: actual.numero, icon: '📄' }] : [])
        ]}
      />

      {tab === 'lista' && (
        <Card title="Presupuestos" icon="📄" subtitle="Propuestas generadas con inteligencia artificial"
          actions={<button className="btn primary sm" onClick={() => setTab('nuevo')}>+ Nuevo con IA</button>}>
          {lista.length === 0 ? (
            <Empty icon="📄" title="Todavia no hay presupuestos" text="Crea el primero seleccionando clientes y describiendo las necesidades."
              action={<button className="btn primary" onClick={() => setTab('nuevo')}>🤖 Crear presupuesto con IA</button>} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Número</th><th>Cliente</th><th>Titulo</th><th>Fecha</th><th>Total</th><th>Estado</th><th /></tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => { setActual(p); setTab('detalle'); }}>
                      <td className="mono small">{p.numero}</td>
                      <td><b>{p.cliente}</b></td>
                      <td className="small truncate" style={{ maxWidth: 260 }}>{p.titulo}</td>
                      <td className="small">{fecha(p.createdAt)}</td>
                      <td><b>{eur(p.total, p.moneda)}</b></td>
                      <td><span className={`chip ${p.estado === 'aceptado' ? 'success' : p.estado === 'rechazado' ? 'danger' : 'info'}`}>{p.estado}</span></td>
                      <td>
                        <button className="btn sm ghost" title="Eliminar" onClick={async (e) => {
                          e.stopPropagation();
                          await api.db.presupuestos.remove(p.id);
                          setLista((l) => l.filter((x) => x.id !== p.id));
                        }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'nuevo' && (
        <>
          <Card icon="🤖" title="Generador de presupuestos con IA" subtitle="Selecciona clientes y apartados: la IA redacta el presupuesto completo con partidas, precios, IVA e IRPF">
            <div className="grid grid-2">
              <div>
                <Field label={`Clientes seleccionados (${selClientes.length})`} hint="Puedes marcarlos desde Localización de clientes">
                  <div className="client-list" style={{ maxHeight: 220 }}>
                    {clientes.length === 0 && <Empty icon="📍" title="No hay clientes guardados" text="Ve a Localización de clientes y guarda resultados." />}
                    {clientes.map((c) => (
                      <label key={c.id} className="client-row" style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={selClientes.find((s) => s.id === c.id) ? true : false}
                          onChange={() => setSelClientes((prev) => prev.find((s) => s.id === c.id) ? prev.filter((s) => s.id !== c.id) : [...prev, c])} />
                        <div style={{ flex: 1 }}>
                          <div className="name">{c.nombre}</div>
                          <div className="meta">{c.categoria} · {c.direccion}</div>
                        </div>
                        <span className="chip">{c.probabilidad}%</span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Necesidades detectadas" hint="Describe el problema del cliente: lo mas concreto posible, la IA lo convierte en partidas técnicas">
                  <textarea rows={5} value={form.necesidades}
                    placeholder="Ej. Quieren presencia en Internet, no tienen web, reciben clientes por WhatsApp y pierden ventas por la noche. Quieren web con catalogo, contacto y pedidos."
                    onChange={(e) => setForm({ ...form, necesidades: e.target.value })} />
                </Field>
              </div>

              <div>
                <Field label="Apartados y servicios a presupuestar" hint="Se envian como base a la IA, que los ajusta al cliente">
                  <div className="row row-tight">
                    {servicios.map((s) => (
                      <button key={s.id} className={`chip ${form.servicios.includes(s.id) ? 'on' : ''}`}
                        onClick={() => setForm((f) => ({ ...f, servicios: f.servicios.includes(s.id) ? f.servicios.filter((x) => x !== s.id) : [...f.servicios, s.id] }))}>
                        {s.icono} {s.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Contexto adicional" hint="Plazos, presupuesto máximo del cliente, tecnología preferida…">
                  <textarea rows={3} value={form.contexto} placeholder="Ej. Presupuesto máximo 4.000 EUR, necesitan en 2 meses, hosting en su propio servidor"
                    onChange={(e) => setForm({ ...form, contexto: e.target.value })} />
                </Field>
                <Field label="Instrucciones extra para la IA">
                  <textarea rows={2} value={form.extra} placeholder="Ej. Incluir mantenimiento 12 meses y formación"
                    onChange={(e) => setForm({ ...form, extra: e.target.value })} />
                </Field>
                <div className="alert info">
                  <div>
                    <b>Modelo usado:</b> {settings?.provider} · {settings?.models?.[settings?.provider] || 'por defecto'}
                    <div className="tiny">Puedes cambiarlo en Configuración.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary lg" onClick={generar} disabled={generando}>
                {generando ? <><span className="spinner" /> Redactando presupuesto...</> : '🤖 Generar presupuesto'}
              </button>
              <button className="btn" onClick={() => navigate('fabrica')}>🏭 Ir a La Fábrica</button>
              <div className="spacer" />
              <span className="small muted">IVA {settings?.quote?.ivaRate}% · IRPF {settings?.quote?.irpfRate}% · validez {settings?.quote?.validityDays} dias</span>
            </div>
          </Card>
        </>
      )}

      {tab === 'detalle' && actual && (
        <DetallePresupuesto
          presupuesto={actual}
          onChange={setActual}
          onRefresh={cargar}
          push={push}
          navigate={navigate}
          settings={settings}
        />
      )}

      <Modal open={verServicios} title="Catalogo de servicios" onClose={() => setVerServicios(false)} wide>
        <div className="grid grid-2">
          {servicios.map((s) => (
            <div key={s.id} className="card card-body" style={{ boxShadow: 'none' }}>
              <b>{s.icono} {s.label}</b>
              <div className="small muted">{s.horasEstimadas} h orientativas · {s.precioHora} EUR/h · ref. {eur(s.horasEstimadas * s.precioHora)}</div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function DetallePresupuesto({ presupuesto, onChange, onRefresh, push, navigate }) {
  const [editando, setEditando] = useState(false);
  const [p, setP] = useState(presupuesto);

  useEffect(() => setP(presupuesto), [presupuesto]);

  const recalcular = async () => {
    try {
      const nuevo = await api.quotes.recalculate(p);
      const saved = await api.db.presupuestos.update(p.id, nuevo);
      setP(saved); onChange(saved); onRefresh();
      push('Importes recalculados', 'success');
    } catch (e) { push(e.message, 'error'); }
  };

  const cambiarEstado = async (estado) => {
    const saved = await api.db.presupuestos.update(p.id, { estado });
    setP(saved); onChange(saved); onRefresh();
    push(`Estado: ${estado}`, 'success');
  };

  const crearTrabajo = async () => {
    const t = await api.db.trabajos.create({
      titulo: `Presupuesto ${p.numero} · ${p.cliente}`,
      tipo: 'presupuesto',
      presupuestoId: p.id,
      clienteId: p.clienteIds?.[0] || null,
      estado: 'pendiente',
      detalle: p.titulo
    });
    push('Trabajo creado en el panel', 'success');
    return t;
  };

  const exportar = async (formato) => {
    try {
      const r = await api.quotes.export({ presupuesto: p, formato });
      if (r) { push(`Guardado en ${r.file}`, 'success'); api.openPath(r.file); }
    } catch (e) { push(e.message, 'error'); }
  };

  const editablePartida = (idx, key, value) => {
    const partidas = p.partidas.map((pt, i) => (i === idx ? { ...pt, [key]: value } : pt));
    setP({ ...p, partidas });
  };

  return (
    <div className="stack">
      <div className="row">
        <BackHome onBack={() => navigate('presupuestos')} label="Volver al listado" extra={<span className="chip primary">{p.estado}</span>} />
      </div>

      <Card>
        <div className="row">
          <div>
            <h2>{p.numero} · {p.titulo}</h2>
            <div className="small muted">{p.cliente} · emitido el {fechaHora(p.createdAt)} · valido hasta {fecha(p.expiraEn)}</div>
          </div>
          <div className="spacer" />
          <div className="row row-tight">
            <button className={`btn sm ${editando ? 'primary' : ''}`} onClick={() => setEditando((v) => !v)}>✏️ {editando ? 'Terminar edicion' : 'Editar partidas'}</button>
            <button className="btn sm" onClick={recalcular}>🧮 Recalcular</button>
            <button className="btn sm" onClick={() => exportar('html')}>📄 Exportar HTML</button>
            <button className="btn sm" onClick={() => exportar('md')}>📝 Exportar MD</button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <span className="small soft">Estado:</span>
          {['borrador', 'enviado', 'aceptado', 'rechazado'].map((e) => (
            <button key={e} className={`chip ${p.estado === e ? 'on' : ''}`} onClick={() => cambiarEstado(e)}>{e}</button>
          ))}
          <div className="spacer" />
          <button className="btn primary sm" onClick={() => navigate('fabrica', p.id)}>🏭 Construir en La Fábrica</button>
          <button className="btn sm" onClick={crearTrabajo}>🗂️ Registrar trabajo</button>
        </div>
      </Card>

      <div className="grid grid-3">
        <Card title="Resumen" icon="📝">
          <p className="soft">{p.resumen}</p>
          {p.solucion && <p className="soft">{p.solucion}</p>}
          {p.notasIA && <div className="alert info small"><div><b>Nota del asesor IA:</b> {p.notasIA}</div></div>}
        </Card>
        <Card title="Condiciones" icon="📌">
          <dl className="kv">
            <dt>Plazo</dt><dd>{p.plazo || '-'}</dd>
            <dt>Forma de pago</dt><dd>{p.formaPago || '-'}</dd>
            <dt>Garantia</dt><dd>{p.garantia || '-'}</dd>
            <dt>Horas totales</dt><dd>{p.totalHoras || p.partidas.reduce((a, x) => a + (x.horas || 0), 0)} h</dd>
            <dt>Modelo IA</dt><dd className="tiny mono">{p.ai?.provider} · {p.ai?.model}</dd>
          </dl>
        </Card>
        <Card title="Incluye / No incluye" icon="📦">
          <b className="small">Incluye</b>
          <ul className="small soft">{(p.incluye || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          <b className="small">No incluye</b>
          <ul className="small soft">{(p.noIncluye || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          {p.riesgos?.length > 0 && <><b className="small">Riesgos</b><ul className="small soft">{p.riesgos.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </Card>
      </div>

      <Card title="Partidas" icon="🧮" bodyClass="tight">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Concepto</th><th>Descripción</th><th style={{ width: 110 }}>Horas</th><th style={{ width: 130 }}>Precio/hora</th><th style={{ width: 140 }}>Importe</th></tr>
            </thead>
            <tbody>
              {p.partidas.map((pt, i) => (
                <tr key={i}>
                  <td><b>{pt.concepto}</b></td>
                  <td className="small soft">{pt.descripcion}</td>
                  <td>{editando ? <input type="number" value={pt.horas} onChange={(e) => editablePartida(i, 'horas', Number(e.target.value))} /> : pt.horas}</td>
                  <td>{editando ? <input type="number" value={pt.precioHora} onChange={(e) => editablePartida(i, 'precioHora', Number(e.target.value))} /> : `${pt.precioHora} ${p.moneda}`}</td>
                  <td><b>{eur(pt.importe, p.moneda)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4} className="right small">Subtotal</td><td><b>{eur(p.subtotal, p.moneda)}</b></td></tr>
              {p.descuentoImporte > 0 && <tr><td colSpan={4} className="right small">Descuento</td><td>-{eur(p.descuentoImporte, p.moneda)}</td></tr>}
              <tr><td colSpan={4} className="right small">Base imponible</td><td>{eur(p.baseImponible, p.moneda)}</td></tr>
              <tr><td colSpan={4} className="right small">IVA {p.ivaPct ?? settingsIVA(p)}%</td><td>{eur(p.iva, p.moneda)}</td></tr>
              <tr><td colSpan={4} className="right small">IRPF -{p.irpfPct ?? 15}%</td><td>-{eur(p.irpf, p.moneda)}</td></tr>
              <tr><td colSpan={4} className="right bold">TOTAL</td><td className="bold" style={{ fontSize: 16 }}>{eur(p.total, p.moneda)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

const settingsIVA = () => 21;