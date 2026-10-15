import React, { useEffect, useMemo, useState } from 'react';
import { api, eur, fechaHora } from '../lib/api.js';
import { BackHome, Card, Empty, Field, Loading, Modal, Tabs, THEMES, useToast } from '../lib/ui.jsx';

const SECTIONS = [
  { id: 'apariencia', label: 'Apariencia', icon: '🎨' },
  { id: 'proveedores', label: 'Proveedores y modelos', icon: '🤖' },
  { id: 'opencode', label: 'OpenCode', icon: '⚡' },
  { id: 'terminal', label: 'Terminal', icon: '⌨️' },
  { id: 'comercial', label: 'Clientes y presupuestos', icon: '💼' },
  { id: 'github', label: 'GitHub', icon: '🐙' },
  { id: 'actualizaciones', label: 'Actualizaciones', icon: '⬆️' },
  { id: 'avanzado', label: 'Avanzado', icon: '🧪' }
];

export default function Configuracion({ settings, info, update, setUpdate, navigate, reloadSettings }) {
  const { push } = useToast();
  const [tab, setTab] = useState('apariencia');
  const [catalog, setCatalog] = useState([]);
  const [status, setStatus] = useState([]);
  const [github, setGithub] = useState(null);
  const [releases, setReleases] = useState([]);
  const [modelsCache, setModelsCache] = useState({});
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [testing, setTesting] = useState(null);
  const [out, setOut] = useState('');
  const [versions, setVersions] = useState(null);

  const cargar = async () => {
    try {
      const [c, s, g, r, v] = await Promise.all([
        api.ai.catalog(), api.ai.status(), api.github.info(), api.github.releases(), api.versions()
      ]);
      setCatalog(c); setStatus(s); setGithub(g); setReleases(r); setVersions(v);
    } catch (e) { push(e.message, 'error'); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const set = async (patch, msg) => {
    setGuardando(true);
    try {
      const s = await api.settings.set(patch);
      await reloadSettings();
      if (msg) push(msg, 'success');
      return s;
    } catch (e) { push(e.message, 'error'); } finally { setGuardando(false); }
  };

  const refrescarModelos = async (pid) => {
    setBuscando(true);
    try {
      if (pid === 'opencode') {
        const r = await api.ai.opencodeModels();
        if (r.ok) { setModelsCache((c) => ({ ...c, [pid]: r.models })); push(`${r.models.length} modelos de OpenCode`, 'success'); }
        else push(r.error || 'Sin modelos', 'warning');
      } else {
        const r = await api.ai.remoteModels(pid);
        if (r.ok) { setModelsCache((c) => ({ ...c, [pid]: r.models })); push(`${r.models.length} modelos de ${pid}`, 'success'); }
        else push(r.error || 'No se pudieron obtener los modelos', 'warning');
      }
    } catch (e) { push(e.message, 'error'); } finally { setBuscando(false); }
  };

  const probar = async (pid, model) => {
    setTesting(pid); setOut('');
    const off = api.ai.onEvent((evt) => {
      if (evt.type === 'token') setOut((o) => (o + evt.text).slice(-3000));
      if (evt.type === 'error') setOut((o) => `${o}\n[ERROR] ${evt.message}`);
      if (evt.type === 'end') setTesting(null);
    });
    try {
      await api.ai.run({
        runId: `test_${pid}_${Date.now()}`,
        prompt: 'Responde exactamente: OK. No añadas nada mas.',
        provider: pid, model, cwd: settings?.factory?.rootFolder
      });
      const s = await api.ai.status();
      setStatus(s);
    } finally {
      setTimeout(() => off?.(), 800);
    }
  };

  const comprobarActualizaciones = async () => {
    try {
      const u = await api.update.check();
      setUpdate(u);
      push(u.available ? `Nueva version ${u.latest.tag}` : 'Estas al dia', u.available ? 'success' : 'info');
      if (!u.available) setTab('actualizaciones');
    } catch (e) { push(e.message, 'error'); }
  };

  const salida = useMemo(() => out || '(sin respuesta)', [out]);

  return (
    <div className="stack">
      <BackHome extra={guardando ? <span className="chip info">guardando…</span> : <span className="chip success">guardado</span>} />

      <Tabs value={tab} onChange={setTab} tabs={SECTIONS.map((s) => ({ ...s }))} />

      {tab === 'apariencia' && (
        <Card icon="🎨" title="Apariencia" subtitle="Elige el tema de color de toda la aplicacion" id="apariencia">
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-card ${settings?.theme === t.id ? 'on' : ''}`} onClick={() => set({ theme: t.id }, `Tema ${t.name} aplicado`)}>
                <div className="theme-swatches">{t.sw.map((c, i) => <span key={i} style={{ background: c }} />)}</div>
                <div className="small bold">{t.name}</div>
              </button>
            ))}
          </div>
          <div className="divider" />
          <div className="grid grid-3">
            <Field label="Densidad de la interfaz">
              <select value={settings?.ui?.density || 'normal'} onChange={(e) => set({ ui: { ...settings.ui, density: e.target.value } })}>
                <option value="normal">Normal</option>
                <option value="compacta">Compacta</option>
              </select>
            </Field>
            <Field label="Idioma">
              <select value={settings?.ui?.language || 'es'} onChange={(e) => set({ ui: { ...settings.ui, language: e.target.value } })}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Menu lateral plegado">
              <label className="check">
                <input type="checkbox" checked={Boolean(settings?.ui?.sidebarCollapsed)} onChange={(e) => set({ ui: { ...settings.ui, sidebarCollapsed: e.target.checked } })} />
                Iniciar con el menu plegado
              </label>
            </Field>
          </div>
        </Card>
      )}

      {tab === 'proveedores' && (
        <div className="stack" id="proveedores">
          <Card icon="🤖" title="Proveedor y modelo por defecto" subtitle="Todos los apartados de la aplicacion usan esta configuracion">
            <div className="grid grid-3">
              <Field label="Proveedor">
                <select value={settings?.provider || 'opencode'} onChange={(e) => set({ provider: e.target.value }, `Proveedor: ${e.target.value}`)}>
                  {catalog.map((p) => <option key={p.id} value={p.id}>{p.name}{status.find((s) => s.id === p.id)?.configured ? ' ✓' : ''}</option>)}
                </select>
              </Field>
              <Field label="Modelo del proveedor seleccionado">
                <select value={settings?.models?.[settings?.provider] || ''} onChange={(e) => set({ models: { ...settings.models, [settings.provider]: e.target.value } }, `Modelo: ${e.target.value}`)}>
                  {(modelsCache[settings?.provider] || catalog.find((p) => p.id === settings?.provider)?.models || []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Agente por defecto (OpenCode)">
                <select value={settings?.agent || 'build'} onChange={(e) => set({ agent: e.target.value })}>
                  <option value="build">build · construye el proyecto</option>
                  <option value="plan">plan · analiza y planifica</option>
                  <option value="general">general · uso general</option>
                  <option value="ask">ask · solo responde</option>
                </select>
              </Field>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => refrescarModelos(settings?.provider)}>
                {buscando ? <span className="spinner" /> : '🔄'} Refrescar modelos
              </button>
              <button className="btn sm" onClick={async () => { const r = await api.ai.syncAuth(); push(r.ok ? `Credenciales sincronizadas con OpenCode (${(r.providers || []).length})` : r.error, r.ok ? 'success' : 'error'); }}>
                🔗 Sincronizar claves con OpenCode
              </button>
              <div className="spacer" />
              <span className="tiny muted">Las claves se guardan cifradas en tu equipo y se inyectan en OpenCode automaticamente.</span>
            </div>
          </Card>

          {catalog.map((p) => {
            const st = status.find((s) => s.id === p.id);
            const isOpenCode = p.id === 'opencode';
            return (
              <Card key={p.id} icon={isOpenCode ? '⚡' : '🔌'} title={p.name}
                subtitle={p.description}
                actions={
                  <>
                    <span className={`chip ${st?.configured ? 'success' : 'danger'}`}>{st?.configured ? 'configurado' : 'sin clave'}</span>
                    {settings?.provider === p.id && <span className="chip primary">activo</span>}
                    <button className="btn sm" onClick={() => set({ provider: p.id }, `${p.name} activado`)}>Usar este</button>
                  </>
                }>
                <div className="grid grid-3">
                  {!isOpenCode && (
                    <Field label={`Clave de API (${p.keyField || 'no requerida'})`} hint={p.needsKey ? 'Necesaria para usar sus modelos' : 'Opcional (modelo local)'}>
                      <input type="password" value={settings?.apiKeys?.[p.id] || ''} placeholder={p.needsKey ? 'sk-…' : 'sin clave'}
                        onChange={(e) => set({ apiKeys: { ...settings.apiKeys, [p.id]: e.target.value } })} />
                    </Field>
                  )}
                  {isOpenCode && (
                    <Field label="Motor" hint="Los modelos de OpenCode se obtienen automaticamente segun las credenciales configuradas aqui">
                      <input type="text" value={info?.paths?.opencode || ''} readOnly className="mono" />
                    </Field>
                  )}
                  <Field label={`Modelos disponibles (${(modelsCache[p.id] || p.models || []).length})`}>
                    <div className="row row-tight">
                      <select value={settings?.models?.[p.id] || ''} onChange={(e) => set({ models: { ...settings.models, [p.id]: e.target.value } })} style={{ flex: 1 }}>
                        {(modelsCache[p.id] || p.models || []).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button className="btn sm" title="Refrescar modelos reales del proveedor" onClick={() => refrescarModelos(p.id)}>🔄</button>
                    </div>
                  </Field>
                  <Field label="Probar conexion">
                    <button className="btn sm block" onClick={() => probar(p.id, settings?.models?.[p.id])} disabled={testing === p.id}>
                      {testing === p.id ? <><span className="spinner" /> Probando</> : '🧪 Enviar prueba'}
                    </button>
                  </Field>
                </div>
                {testing === p.id && (
                  <pre className="code" style={{ marginTop: 10 }}>{salida}</pre>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'opencode' && (
        <Card icon="⚡" title="OpenCode" subtitle="Motor principal: modelos, agentes y permisos">
          <div className="grid grid-2">
            <Field label="Ruta del ejecutable" hint="Dejala vacia para detectarla automaticamente">
              <input type="text" value={settings?.opencode?.binary || ''} placeholder="~/.opencode/bin/opencode"
                onChange={(e) => set({ opencode: { ...settings.opencode, binary: e.target.value } })} />
            </Field>
            <Field label="Servidor OpenCode (opcional)" hint="Si tienes opencode serve en otro puerto">
              <input type="text" value={settings?.opencode?.serverUrl || ''} placeholder="http://127.0.0.1:4096"
                onChange={(e) => set({ opencode: { ...settings.opencode, serverUrl: e.target.value } })} />
            </Field>
          </div>
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={settings?.opencode?.autoApprove !== false} onChange={(e) => set({ opencode: { ...settings.opencode, autoApprove: e.target.checked } })} />
            Aprobar permisos automaticamente (necesario para que La Fabrica cree ficheros)
          </label>
          <label className="check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={Boolean(settings?.opencode?.thinking)} onChange={(e) => set({ opencode: { ...settings.opencode, thinking: e.target.checked } })} />
            Mostrar bloques de razonamiento
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={async () => { const r = await api.ai.opencodeModels(); push(r.ok ? `${r.models.length} modelos activos` : (r.error || 'sin modelos'), r.ok ? 'success' : 'warning'); if (r.ok) setModelsCache((c) => ({ ...c, opencode: r.models })); }}>
              🔄 Consultar modelos de OpenCode
            </button>
            <button className="btn sm" onClick={() => api.openPath(info?.paths?.opencodeAuth)}>📂 Ver credenciales</button>
            <div className="spacer" />
            {modelsCache.opencode?.length > 0 && (
              <div className="row row-tight" style={{ maxWidth: 520, maxHeight: 90, overflow: 'auto' }}>
                {modelsCache.opencode.slice(0, 24).map((m) => <span key={m} className="chip static tiny">{m}</span>)}
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === 'terminal' && (
        <Card icon="⌨️" title="Terminal" subtitle="Shell y directorio por defecto del terminal integrado">
          <div className="grid grid-2">
            <Field label="Shell"><input type="text" value={settings?.terminal?.shell || ''} placeholder="/bin/bash"
              onChange={(e) => set({ terminal: { ...settings.terminal, shell: e.target.value } })} /></Field>
            <Field label="Directorio de trabajo"><input type="text" value={settings?.terminal?.cwd || ''} placeholder="/home/usuario"
              onChange={(e) => set({ terminal: { ...settings.terminal, cwd: e.target.value } })} /></Field>
          </div>
          <button className="btn sm" onClick={() => navigate('terminal')}>Abrir la terminal</button>
        </Card>
      )}

      {tab === 'comercial' && (
        <Card icon="💼" title="Clientes y presupuestos" subtitle="Parametros economicos y de localizacion">
          <div className="grid grid-3">
            <Field label="IVA (%)"><input type="number" value={settings?.quote?.ivaRate ?? 21} onChange={(e) => set({ quote: { ...settings.quote, ivaRate: Number(e.target.value) } })} /></Field>
            <Field label="IRPF (%)"><input type="number" value={settings?.quote?.irpfRate ?? 15} onChange={(e) => set({ quote: { ...settings.quote, irpfRate: Number(e.target.value) } })} /></Field>
            <Field label="Margen objetivo (%)"><input type="number" value={settings?.quote?.marginRate ?? 25} onChange={(e) => set({ quote: { ...settings.quote, marginRate: Number(e.target.value) } })} /></Field>
            <Field label="Validez del presupuesto (dias)"><input type="number" value={settings?.quote?.validityDays ?? 30} onChange={(e) => set({ quote: { ...settings.quote, validityDays: Number(e.target.value) } })} /></Field>
            <Field label="Moneda"><select value={settings?.quote?.currency || 'EUR'} onChange={(e) => set({ quote: { ...settings.quote, currency: e.target.value } })}><option>EUR</option><option>USD</option><option>GBP</option></select></Field>
            <Field label="Carpeta raiz de proyectos"><input type="text" value={settings?.factory?.rootFolder || ''}
              onChange={(e) => set({ factory: { ...settings.factory, rootFolder: e.target.value } })} /></Field>
          </div>
          <div className="divider" />
          <div className="grid grid-2">
            <Field label="Centro por defecto del mapa"><input type="text" value={settings?.geolocation?.defaultCenter?.lat ?? ''} placeholder="38.4805"
              onChange={(e) => set({ geolocation: { ...settings.geolocation, defaultCenter: { ...settings.geolocation.defaultCenter, lat: Number(e.target.value) } } })} /></Field>
            <Field label="User-Agent para OpenStreetMap" hint="Obligatorio por la polite policy de Nominatim">
              <input type="text" value={settings?.geolocation?.userAgent || ''} onChange={(e) => set({ geolocation: { ...settings.geolocation, userAgent: e.target.value } })} /></Field>
          </div>
          <button className="btn sm" onClick={() => api.openPath(settings?.factory?.rootFolder)}>📂 Abrir carpeta de proyectos</button>
        </Card>
      )}

      {tab === 'github' && (
        <div className="stack">
          <Card icon="🐙" title="Repositorio de GitHub" subtitle="Publicacion de proyectos, releases y autoactualizacion"
            actions={github && <span className={`chip ${github.ok ? 'success' : 'danger'}`}>{github.ok ? 'conectado' : 'sin conexion'}</span>}>
            <div className="grid grid-2">
              <Field label="Usuario"><input type="text" value={settings?.github?.user || ''} onChange={(e) => set({ github: { ...settings.github, user: e.target.value } })} /></Field>
              <Field label="Repositorio"><input type="text" value={settings?.github?.repo || ''} onChange={(e) => set({ github: { ...settings.github, repo: e.target.value } })} /></Field>
              <Field label="URL"><input type="text" value={settings?.github?.url || ''} onChange={(e) => set({ github: { ...settings.github, url: e.target.value } })} /></Field>
              <Field label="Token de acceso" hint="Permite publicar proyectos y consultar releases">
                <input type="password" value={settings?.github?.token || ''} onChange={(e) => set({ github: { ...settings.github, token: e.target.value } })} />
              </Field>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => api.openExternal(settings?.github?.url)}>🔗 Abrir repositorio</button>
              <button className="btn sm" onClick={async () => { const u = await api.github.user(); push(u.ok ? `Conectado como ${u.login}` : u.error, u.ok ? 'success' : 'error'); }}>🧪 Verificar token</button>
              <div className="spacer" />
              {github?.ok && <span className="small muted">★ {github.stars} · {github.private ? 'privado' : 'publico'} · rama {github.defaultBranch}</span>}
            </div>
          </Card>

          <Card icon="🏷️" title="Releases" subtitle="Se usan para las actualizaciones automaticas">
            {releases.length === 0 ? <Empty icon="🏷️" title="Sin releases" text="Publica una release con el paquete .deb para que los usuarios puedan actualizar." /> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Tag</th><th>Nombre</th><th>Fecha</th><th>Assets</th><th /></tr></thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr key={r.tag}>
                        <td className="mono small">{r.tag}</td>
                        <td className="truncate" style={{ maxWidth: 240 }}>{r.name}</td>
                        <td className="small">{fechaHora(r.publishedAt)}</td>
                        <td>{r.assets.map((a) => <span key={a.name} className="chip static tiny">{a.name}</span>)}</td>
                        <td><button className="btn sm ghost" onClick={() => api.openExternal(r.url)}>↗</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'actualizaciones' && (
        <Card icon="⬆️" title="Actualizaciones" subtitle="Busca nuevas versiones en GitHub, actualiza y reinicia" id="actualizaciones">
          <div className="row">
            <div className="kpi" style={{ padding: 0 }}>
              <div className="label">Version instalada</div>
              <div className="value">{info?.version}</div>
              <div className="tiny muted">{versions?.opencode ? `OpenCode ${versions.opencode}` : ''} · Electron {info?.electron}</div>
            </div>
            <div className="spacer" />
            <button className="btn primary" onClick={comprobarActualizaciones}>🔍 Buscar actualizaciones</button>
          </div>

          {update && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className={`alert ${update.available ? 'ok' : 'info'}`}>
                <div>
                  <b>{update.available ? `Nueva version disponible: ${update.latest?.tag}` : 'Estas al dia'}</b>
                  {update.latest && <div className="small">{update.latest.name} · publicada el {fechaHora(update.latest.publishedAt)}</div>}
                </div>
              </div>
              {update.latest?.notes && <pre className="code" style={{ maxHeight: 220 }}>{update.latest.notes}</pre>}
              <div className="row">
                <UpdateButtons update={update} push={push} onDone={() => comprobarActualizaciones()} />
              </div>
            </div>
          )}

          <div className="divider" />
          <label className="check">
            <input type="checkbox" checked={settings?.updates?.checkOnStart !== false} onChange={(e) => set({ updates: { ...settings.updates, checkOnStart: e.target.checked } })} />
            Buscar actualizaciones al iniciar la aplicacion
          </label>
        </Card>
      )}

      {tab === 'avanzado' && (
        <Card icon="🧪" title="Avanzado" subtitle="Mantenimiento y datos de la aplicacion">
          <div className="row">
            <button className="btn sm" onClick={() => api.settings.openFolder('config')}>📂 Ajustes</button>
            <button className="btn sm" onClick={() => api.settings.openFolder('data')}>📂 Datos</button>
            <button className="btn sm" onClick={() => api.settings.openFolder('projects')}>📂 Proyectos</button>
            <button className="btn sm" onClick={() => navigate('credenciales')}>🔑 Credenciales del titular</button>
            <div className="spacer" />
            <button className="btn sm danger" onClick={async () => {
              if (window.confirm('Se restauraran todos los ajustes por defecto. ¿Continuar?')) {
                await api.settings.reset(); await reloadSettings(); push('Ajustes restablecidos', 'success');
              }
            }}>Restablecer ajustes</button>
          </div>
          <div className="divider" />
          <dl className="kv">
            <dt>Electron</dt><dd>{info?.electron}</dd>
            <dt>Chrome</dt><dd>{info?.chrome}</dd>
            <dt>Node</dt><dd>{info?.node}</dd>
            <dt>Plataforma</dt><dd>{info?.platform} ({info?.arch})</dd>
            <dt>Licencia</dt><dd>MIT · Jose Manuel Bernabeu Mejias</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}

function UpdateButtons({ update, push, onDone }) {
  const [estado, setEstado] = useState('idle');
  const [prog, setProg] = useState(null);

  useEffect(() => {
    const offP = api.update.onProgress((p) => setProg(p));
    const offS = api.update.onStatus((s) => setProg({ status: s.message }));
    return () => { offP?.(); offS?.(); };
  }, []);

  const descargar = async () => {
    setEstado('descargando');
    try {
      const f = await api.update.download();
      setEstado('instalando');
      const r = await api.update.install(f.dest);
      if (!r.ok) { push(`No se pudo instalar: ${r.error}`, 'error', 10000); setEstado('error'); }
      onDone?.();
    } catch (e) { push(e.message, 'error'); setEstado('error'); }
  };

  return (
    <>
      <button className="btn primary" onClick={descargar} disabled={!update.available || estado === 'descargando' || estado === 'instalando'}>
        {estado === 'idle' ? '⬇️ Actualizar ahora' : estado === 'descargando' ? 'Descargando…' : estado === 'instalando' ? 'Instalando…' : 'Reintentar'}
      </button>
      <button className="btn" onClick={() => api.update.relaunch()}>↻ Reiniciar aplicacion</button>
      {prog?.percent != null && (
        <div style={{ minWidth: 220 }}>
          <div className="meter"><span style={{ width: `${prog.percent}%` }} /></div>
          <div className="tiny muted">{prog.status || `${prog.percent}%`}</div>
        </div>
      )}
    </>
  );
}