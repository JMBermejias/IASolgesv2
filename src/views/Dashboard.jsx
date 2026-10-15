import React, { useEffect, useMemo, useState } from 'react';
import { api, eur, fechaHora, haceCuanto } from '../lib/api.js';
import { Card, Empty, Meter, Loading, useToast } from '../lib/ui.jsx';

export default function Dashboard({ settings, info, navigate }) {
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [clientes, presupuestos, proyectos, trabajos, analyses] = await Promise.all([
        api.db.clientes.all(), api.db.presupuestos.all(), api.db.proyectos.all(), api.db.trabajos.all(), api.db.analyses.all()
      ]);
      setData({ clientes, presupuestos, proyectos, trabajos, analyses });
    } catch (e) {
      push(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { clientes, presupuestos, proyectos, trabajos, analyses } = data;
    const facturado = presupuestos.filter((p) => p.estado === 'aceptado').reduce((a, p) => a + (p.total || 0), 0);
    const pipeline = presupuestos.filter((p) => p.estado !== 'aceptado' && p.estado !== 'rechazado').reduce((a, p) => a + (p.total || 0), 0);
    const sinWeb = clientes.filter((c) => !c.contacto?.website).length;
    return {
      clientes: clientes.length,
      oportunidades: sinWeb,
      presupuestos: presupuestos.length,
      facturado,
      pipeline,
      conversion: presupuestos.length ? Math.round((presupuestos.filter((p) => p.estado === 'aceptado').length / presupuestos.length) * 100) : 0,
      proyectos: proyectos.length,
      trabajos: trabajos.length,
      analisis: analyses.length,
      cumplimiento: analyses.length ? Math.round(analyses.reduce((a, x) => a + (x.score || 0), 0) / analyses.length) : null
    };
  }, [data]);

  if (loading) return <Loading text="Cargando tu panel de control…" />;
  if (!data) return <Empty title="Sin datos" />;

  const recientes = [...data.trabajos].slice(0, 8);

  return (
    <div className="stack">
      <div className="dash-hero">
        <div>
          <h1>Bienvenido a IASolges.v2</h1>
          <p>
            Agente inteligente para localizar clientes, presupuestar, construir aplicaciones con IA y auditar
            legalmente todo lo que entregas. Todo integrado con el proveedor de IA que configures
            ({settings?.provider === 'opencode' ? 'OpenCode' : settings?.provider}).
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => navigate('localizacion')}>📍 Buscar clientes</button>
          <button className="btn" onClick={() => navigate('presupuestos')}>📄 Nuevo presupuesto</button>
          <button className="btn" onClick={() => navigate('fabrica')}>🏭 Ir a La Fabrica</button>
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi icon="👥" label="Clientes" value={stats.clientes} delta={`${stats.oportunidades} sin presencia digital`} onClick={() => navigate('localizacion')} />
        <Kpi icon="📄" label="Presupuestos" value={stats.presupuestos} delta={`${stats.conversion}% de conversion`} onClick={() => navigate('presupuestos')} />
        <Kpi icon="💶" label="Cartera en juego" value={eur(stats.pipeline)} delta={`${eur(stats.facturado)} aceptados`} />
        <Kpi icon="🏭" label="Proyectos creados" value={stats.proyectos} delta={`${stats.trabajos} trabajos registrados`} onClick={() => navigate('fabrica')} />
      </div>

      <div className="grid grid-3">
        <Card title="Trabajos recientes" icon="🗂️" subtitle="Enlaces directos a cada trabajo" bodyClass="tight"
          actions={<button className="btn sm ghost" onClick={() => navigate('fabrica')}>Ver todos</button>}>
          {recientes.length === 0 ? (
            <Empty icon="🗂️" title="Todavia no hay trabajos" text="Crea tu primer presupuesto o proyecto desde La Fabrica." />
          ) : recientes.map((t) => (
            <div key={t.id} className="link-row" onClick={() => navigate(t.tipo === 'creacion' ? 'fabrica' : t.tipo === 'legal' ? 'legal' : 'presupuestos', t.id)}>
              <div className="ico">{t.tipo === 'creacion' ? '🏭' : t.tipo === 'legal' ? '⚖️' : '📄'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name truncate">{t.titulo}</div>
                <div className="meta">{t.estado} · {haceCuanto(t.createdAt)}</div>
              </div>
              <span className={`chip ${t.estado === 'completado' ? 'success' : 'info'}`}>{t.estado}</span>
            </div>
          ))}
        </Card>

        <Card title="Clientes destacados" icon="⭐" subtitle="Mayor probabilidad de contratacion"
          actions={<button className="btn sm ghost" onClick={() => navigate('localizacion')}>Ver todos</button>}>
          {[...data.clientes].sort((a, b) => (b.probabilidad || 0) - (a.probabilidad || 0)).slice(0, 8).length === 0 ? (
            <Empty icon="📍" title="Sin clientes" text="Localiza clientes potenciales en el mapa." />
          ) : [...data.clientes].sort((a, b) => (b.probabilidad || 0) - (a.probabilidad || 0)).slice(0, 8).map((c) => (
            <div key={c.id} className="link-row" onClick={() => navigate('localizacion', c.id)}>
              <div className="ico">{c.contacto?.website ? '🌐' : '🏪'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name truncate">{c.nombre}</div>
                <div className="meta truncate">{c.categoria} · {c.direccion}</div>
              </div>
              <div style={{ width: 70 }}>
                <div className="tiny right bold" style={{ marginBottom: 3 }}>{c.probabilidad}%</div>
                <Meter value={c.probabilidad} />
              </div>
            </div>
          ))}
        </Card>

        <Card title="Presupuestos" icon="💶" subtitle="Estado de las propuestas"
          actions={<button className="btn sm ghost" onClick={() => navigate('presupuestos')}>Ver todos</button>}>
          {data.presupuestos.length === 0 ? (
            <Empty icon="📄" title="Sin presupuestos" text="Genera uno con IA a partir de tus clientes." />
          ) : data.presupuestos.slice(0, 8).map((p) => (
            <div key={p.id} className="link-row" onClick={() => navigate('presupuestos', p.id)}>
              <div className="ico">📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name truncate">{p.numero} · {p.cliente}</div>
                <div className="meta">{p.titulo}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="bold small">{eur(p.total, p.moneda)}</div>
                <div className="tiny muted">{p.estado}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Accesos rapidos" icon="⚡">
          <div className="quick-grid">
            <button className="quick" onClick={() => navigate('localizacion')}><span className="ico">📍</span><b>Localizar clientes</b><span>Mapa con analisis deConversion</span></button>
            <button className="quick" onClick={() => navigate('presupuestos')}><span className="ico">📄</span><b>Crear presupuesto</b><span>IA + partidas + IVA/IRPF</span></button>
            <button className="quick" onClick={() => navigate('fabrica')}><span className="ico">🏭</span><b>La Fabrica</b><span>Apps, agentes y webs</span></button>
            <button className="quick" onClick={() => navigate('legal')}><span className="ico">⚖️</span><b>Analisis legal</b><span>Cookies, RGPD, LSSI…</span></button>
            <button className="quick" onClick={() => navigate('terminal')}><span className="ico">⬛</span><b>Terminal IA</b><span>Consola directa al modelo</span></button>
            <button className="quick" onClick={() => navigate('configuracion')}><span className="ico">⚙️</span><b>Configuracion</b><span>Proveedores y modelos</span></button>
          </div>
        </Card>

        <Card title="Cumplimiento legal" icon="⚖️" subtitle="Media de las auditorias realizadas"
          actions={<button className="btn sm ghost" onClick={() => navigate('legal')}>Analizar</button>}>
          {data.analyses.length === 0 ? (
            <Empty icon="⚖️" title="Sin analisis" text="Audita una web o un proyecto generado." />
          ) : (
            <div className="stack-sm">
              <div className="row">
                <div className="kpi" style={{ padding: 0 }}>
                  <div className="value">{stats.cumplimiento}%</div>
                  <div className="label">Puntuacion media</div>
                </div>
                <div className="spacer" />
                <div className="right">
                  <div className="small soft">{data.analyses.length} analisis realizados</div>
                  <div className="tiny muted">RGPD · LSSI-CE · LOPDGDD · RD 1112/2018</div>
                </div>
              </div>
              <div className="divider" />
              {data.analyses.slice(0, 5).map((a) => (
                <div key={a.id} className="link-row" onClick={() => navigate('legal', a.id)}>
                  <div className="ico" style={{ color: a.veredicto?.color }}>⚖️</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="name truncate">{a.objetivo}</div>
                    <div className="meta">{fechaHora(a.createdAt)}</div>
                  </div>
                  <span className="chip" style={{ background: `${a.veredicto?.color}1a`, color: a.veredicto?.color }}>{a.veredicto?.nivel}</span>
                  <span className="bold small">{a.score}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Estado del sistema" icon="🖥️" subtitle="Informacion tecnica de la instalacion">
        <div className="grid grid-3">
          <dl className="kv">
            <dt>Version</dt><dd>{info?.version}</dd>
            <dt>Electron</dt><dd>{info?.electron}</dd>
            <dt>Node</dt><dd>{info?.node}</dd>
          </dl>
          <dl className="kv">
            <dt>Plataforma</dt><dd>{info?.platform} · {info?.arch}</dd>
            <dt>OpenCode</dt><dd>{info?.paths?.opencode || 'No detectado'}</dd>
            <dt>Proveedor IA</dt><dd>{settings?.provider}</dd>
          </dl>
          <dl className="kv">
            <dt>Datos</dt><dd className="mono tiny">{info?.paths?.data}</dd>
            <dt>Proyectos</dt><dd className="mono tiny">{info?.paths?.projects}</dd>
            <dt>Repositorio</dt><dd className="mono tiny">{info?.repo}</dd>
          </dl>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" onClick={() => api.openPath(info?.paths?.data)}>Abrir carpeta de datos</button>
          <button className="btn sm" onClick={() => api.openExternal(info?.repo)}>Abrir repositorio GitHub</button>
          <button className="btn sm" onClick={() => navigate('credenciales')}>Credenciales del titular</button>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, delta, onClick }) {
  return (
    <div className="card kpi" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="row">
        <div className="icon-badge">{icon}</div>
        <div className="spacer" />
      </div>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}