import React, { useEffect, useMemo, useRef, useState } from 'react';
import XTerminal from '../components/XTerminal.jsx';
import { api, eur, fechaHora, haceCuanto } from '../lib/api.js';
import { BackHome, Card, Empty, Field, Loading, Modal, useToast } from '../lib/ui.jsx';

export default function Fabrica({ id, settings, navigate }) {
  const { push } = useToast();
  const [tipos, setTipos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [activo, setActivo] = useState(null);
  const [arbol, setArbol] = useState([]);
  const [form, setForm] = useState({
    nombre: '', tipo: 'web', descripcion: '', presupuestoId: '', clienteId: '',
    servicios: ['web'], requisitos: '', autoLegal: true, pushToGithub: false
  });

  const feedRef = useRef(null);
  const handlersRef = useRef({});

  const cargar = async () => {
    setLoading(true);
    try {
      const [t, s, p, c, pr] = await Promise.all([
        api.factory.tipos(), api.quotes.servicios(), api.db.presupuestos.all(),
        api.db.clientes.all(), api.db.proyectos.all()
      ]);
      setTipos(t); setServicios(s); setPresupuestos(p); setClientes(c); setProyectos(pr);
      if (id && p.find((x) => x.id === id)) {
        const pre = p.find((x) => x.id === id);
        setForm((f) => ({
          ...f,
          presupuestoId: id,
          nombre: pre.titulo,
          clienteId: pre.clienteIds?.[0] || '',
          servicios: pre.servicios?.length ? pre.servicios : f.servicios,
          descripcion: pre.resumen || ''
        }));
      }
    } catch (e) { push(e.message, 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  /* Suscripcion unica a los eventos de La Fábrica */
  useEffect(() => {
    const off = api.factory.onEvent((evt) => {
      const h = handlersRef.current;
      if (h.token) h.token(evt.text || '', evt.kind);
      if (evt.kind === 'done') {
        setCreando(false);
        push('Proyecto creado correctamente', 'success', 6000);
        cargar();
        if (evt.legal) navigate('legal', evt.legal);
      }
      if (evt.kind === 'error') push(evt.text, 'error', 8000);
    });
    return off;
  }, [cargar, navigate, push]);

  const crear = async () => {
    if (!form.nombre && !form.descripcion) return push('Indica un nombre o una descripción del proyecto', 'warning');
    setCreando(true);
    if (feedRef.current) feedRef.current('', 'status');
    try {
      await api.factory.create({
        ...form,
        provider: settings?.provider,
        model: settings?.models?.[settings?.provider],
        agent: settings?.agent || 'build'
      });
      push('Creando proyecto... la IA esta trabajando', 'info');
    } catch (e) {
      setCreando(false);
      push(e.message, 'error', 8000);
    }
  };

  const verArbol = async (p) => {
    setActivo(p);
    try { setArbol(await api.factory.tree(p.carpeta)); } catch (e) { push(e.message, 'error'); }
  };

  const verArchivo = async (file) => {
    const r = await api.factory.read(file);
    if (!r.ok) return push(r.error, 'error');
    push(`Archivo abierto: ${file.split('/').pop()}`, 'info');
    modalArchivo(file, r.content);
  };

  const modalArchivo = (name, content) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) {
      w.document.write(`<pre style="font-family:monospace;padding:16px;white-space:pre-wrap">${content.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`);
      w.document.title = name.split('/').pop();
    }
  };

  if (loading) return <Loading text="Preparando La Fábrica..." />;

  return (
    <div className="stack">
      <BackHome extra={<span className="chip primary">{proyectos.length} proyectos</span>} />

      <Card icon="🏭" title="La Fábrica" subtitle="Crea agentes, webs, aplicaciones, imágenes, renders, vídeos y bots para WhatsApp, Telegram o Facebook. Siempre con IA integrada.">
        <div className="grid grid-3">
          <div>
            <Field label="Nombre del proyecto" required>
              <input type="text" value={form.nombre} placeholder="Ej. Tienda-online-Bernabeu"
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Tipo de producto">
              <div className="row row-tight">
                {tipos.map((t) => (
                  <button key={t.id} className={`chip ${form.tipo === t.id ? 'on' : ''}`} onClick={() => setForm({ ...form, tipo: t.id })}>
                    {t.icono} {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Que debe hacer" hint="Describe el producto con detalle: funciones, usuarios, pantallas, integraciones…">
              <textarea rows={5} value={form.descripcion} placeholder="Ej. Tienda online para venta de miel con catalogo, carrito, pago con Stripe y panel de pedidos. Debe funcionar en móvil."
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Field>
          </div>

          <div>
            <Field label="Basado en presupuesto" hint="Opcional: puedes crear sin presupuesto (creación libre)">
              <select value={form.presupuestoId} onChange={(e) => setForm({ ...form, presupuestoId: e.target.value })}>
                <option value="">— Sin presupuesto (creación libre) —</option>
                {presupuestos.map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.cliente} · {eur(p.total, p.moneda)}</option>)}
              </select>
            </Field>
            <Field label="Cliente">
              <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">— Sin cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.categoria})</option>)}
              </select>
            </Field>
            <Field label="Servicios incluidos">
              <div className="row row-tight">
                {servicios.map((s) => (
                  <button key={s.id} className={`chip ${form.servicios.includes(s.id) ? 'on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, servicios: f.servicios.includes(s.id) ? f.servicios.filter((x) => x !== s.id) : [...f.servicios, s.id] }))}>
                    {s.icono} {s.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div>
            <Field label="Requisitos adicionales o técnicas concretas">
              <textarea rows={5} value={form.requisitos} placeholder="Ej. Node + React, PostgreSQL, integrar pasarela de pago Redsys, IA para generar descripción de producto, desplegar como .deb"
                onChange={(e) => setForm({ ...form, requisitos: e.target.value })} />
            </Field>
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={form.autoLegal} onChange={(e) => setForm({ ...form, autoLegal: e.target.checked })} />
              Analisis legal automatico al terminar
            </label>
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={form.pushToGithub} onChange={(e) => setForm({ ...form, pushToGithub: e.target.checked })} />
              Publicar el proyecto en GitHub
            </label>
            <div className="alert info small" style={{ marginTop: 10 }}>
              <div>
                <b>Motor:</b> {settings?.provider} · {settings?.models?.[settings?.provider] || ''}
                <div className="tiny">Agente: {settings?.agent || 'build'} · el proceso se vera en el terminal de abajo.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary lg" onClick={crear} disabled={creando}>
            {creando ? <><span className="spinner" /> La IA esta trabajando...</> : '🏭 Crear proyecto con IA'}
          </button>
          {creando && <span className="small muted pulse">Puedes seguir trabajando: la IA continua en segundo plano</span>}
        </div>
      </Card>

      <Card
        icon="⬛"
        title="Area de trabajo (terminal en vivo)"
        subtitle={creando ? 'Generando código en tiempo real…' : 'Aqui se muestra la salida de la IA mientras crea el proyecto'}
        bodyClass="tight"
        actions={creando && <span className="chip warning pulse">en ejecución</span>}
      >
        <div className="terminal-wrap" style={{ height: 380 }}>
          <XTerminal feed={(fn) => { feedRef.current = fn; return () => { feedRef.current = null; }; }} />
        </div>
      </Card>

      <Card icon="📁" title={`Proyectos generados (${proyectos.length})`} subtitle="Cada proyecto vive en su propia carpeta y queda auditado legalmente"
        actions={<button className="btn sm" onClick={() => api.openPath(proyectos[0]?.carpeta)}>Abrir carpeta raiz</button>}>
        {proyectos.length === 0 ? (
          <Empty icon="🏭" title="Todavia no has creado proyectos" text="Define que necesitas y pulsa Crear proyecto con IA." />
        ) : (
          <div className="grid grid-2">
            {proyectos.map((p) => (
              <div key={p.id} className="card card-body" style={{ boxShadow: 'none' }}>
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b className="truncate">{p.nombre}</b>
                    <div className="tiny muted truncate">{p.tipo} · {haceCuanto(p.createdAt)}</div>
                  </div>
                  <span className={`chip ${p.estado === 'completado' ? 'success' : p.estado === 'error' ? 'danger' : 'warning'}`}>{p.estado}</span>
                </div>
                <p className="small soft truncate" style={{ margin: '8px 0' }}>{p.descripcion}</p>
                <div className="tiny muted mono truncate">{p.carpeta}</div>
                <div className="row row-tight" style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => verArbol(p)}>📂 Ver archivos</button>
                  <button className="btn sm" onClick={() => api.openPath(p.carpeta)}>📁 Abrir carpeta</button>
                  {p.legalId && <button className="btn sm" onClick={() => navigate('legal', p.legalId)}>⚖️ Análisis legal</button>}
                  {p.github?.url && <button className="btn sm" onClick={() => api.openExternal(p.github.url)}>🐙 GitHub</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={Boolean(activo)} wide title={`Archivos · ${activo?.nombre || ''}`} onClose={() => setActivo(null)}>
        <div className="small muted mono" style={{ marginBottom: 10 }}>{activo?.carpeta}</div>
        <div className="client-list" style={{ maxHeight: 460 }}>
          {arbol.map((f) => (
            <div key={f.path} className={`client-row ${f.type === 'dir' ? '' : ''}`} onClick={() => f.type === 'file' && verArchivo(`${activo.carpeta}/${f.path}`)}>
              <span>{f.type === 'dir' ? '📁' : '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}><div className="name truncate">{f.path}</div></div>
              {f.type === 'file' && <span className="tiny muted">{f.size} B</span>}
            </div>
          ))}
          {arbol.length === 0 && <Empty icon="📂" title="Sin archivos" />}
        </div>
      </Modal>
    </div>
  );
}