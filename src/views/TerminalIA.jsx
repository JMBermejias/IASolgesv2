import React, { useEffect, useMemo, useRef, useState } from 'react';
import XTerminal from '../components/XTerminal.jsx';
import { api, haceCuanto } from '../lib/api.js';
import { BackHome, Card, Field, Loading, useToast } from '../lib/ui.jsx';

const AGENTES = ['build', 'plan', 'general', 'ask'];

export default function TerminalIA({ settings, info, navigate }) {
  const { push } = useToast();
  const [modo, setModo] = useState('ia');           // 'ia' | 'shell'
  const [catalog, setCatalog] = useState([]);
  const [cwd, setCwd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [historial, setHistorial] = useState([]);
  const [estado, setEstado] = useState('');
  const [ejecutando, setEjecutando] = useState(false);
  const [cwdInput, setCwdInput] = useState('');
  const runIdRef = useRef(null);
  const buffersRef = useRef({});

  useEffect(() => {
    api.ai.catalog().then(setCatalog).catch(() => {});
    api.terminal.cwd().then((r) => { setCwd(r.cwd); setCwdInput(r.cwd); }).catch(() => {});
  }, []);

  useEffect(() => {
    const off = api.ai.onEvent((evt) => {
      const feed = feedRef.current;
      if (feed) {
        if (evt.type === 'token') feed(evt.text, 'token');
        else if (evt.type === 'status') feed(evt.message, 'status');
        else if (evt.type === 'error') feed(evt.message, 'error');
        else if (evt.type === 'log') feed(evt.text, 'warn');
        else if (evt.type === 'session') setEstado(`Sesión ${evt.sessionId}`);
      }
      if (evt.type === 'token' && evt.runId) {
        buffersRef.current[evt.runId] = (buffersRef.current[evt.runId] || '') + evt.text;
      }
      if (evt.type === 'end') {
        setEjecutando(false);
        const txt = buffersRef.current[evt.runId];
        if (txt) {
          setHistorial((h) => [{ id: evt.runId, at: new Date().toISOString(), texto: txt, prompt: (buffersRef.current[`p_${evt.runId}`] || '') }, ...h].slice(0, 30));
          delete buffersRef.current[evt.runId];
        }
        feedRef.current?.('', 'success');
      }
    });
    return off;
  }, []);

  const feedRef = useRef(null);

  const enviar = async () => {
    if (!prompt.trim() || ejecutando) return;
    const runId = `run_${Date.now().toString(36)}`;
    buffersRef.current[`p_${runId}`] = prompt;
    feedRef.current?.('', 'status');
    feedRef.current?.(`\x1b[1;36m> ${prompt}\x1b[0m\r\n`, 'raw');
    setEjecutando(true);
    setPrompt('');
    try {
      await api.ai.run({
        runId,
        prompt,
        provider: settings?.provider,
        model: settings?.models?.[settings?.provider],
        agent: settings?.agent || 'build',
        cwd: cwd || undefined
      });
    } catch (e) {
      push(e.message, 'error');
      setEjecutando(false);
    }
  };

  const cancelar = async () => {
    if (runIdRef.current) await api.ai.cancel(runIdRef.current);
    setEjecutando(false);
  };

  const modeloActual = settings?.models?.[settings?.provider];

  return (
    <div className="stack" style={{ height: '100%', padding: 0 }}>
      <div style={{ padding: '14px 22px 0' }}>
        <BackHome extra={<span className="chip primary">{settings?.provider} · {modeloActual}</span>} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 330px', gap: 16, padding: '0 22px 22px', flex: 1, minHeight: 0 }}>
        <div className="stack" style={{ minHeight: 0 }}>
          <Card bodyClass="tight">
            <div className="row row-tight">
              <button className={`btn sm ${modo === 'ia' ? 'primary' : ''}`} onClick={() => setModo('ia')}>🤖 Consola de IA</button>
              <button className={`btn sm ${modo === 'shell' ? 'primary' : ''}`} onClick={() => setModo('shell')}>⌨️ Shell del sistema</button>
              <div className="spacer" />
              <span className="chip static" title="Motor activo">{settings?.provider} · {modeloActual}</span>
              <button className="btn sm ghost" onClick={() => navigate('configuracion', 'proveedores')}>⚙️ Cambiar modelo</button>
            </div>
          </Card>

          <div className="card" style={{ flex: 1, minHeight: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="terminal-wrap" style={{ flex: 1, minHeight: 0 }}>
              <XTerminal
                key={modo}
                shell={modo === 'shell'}
                cwd={modo === 'shell' ? cwd : undefined}
                feed={(fn) => { feedRef.current = fn; return () => { feedRef.current = null; }; }}
              />
            </div>
          </div>

          {modo === 'ia' ? (
            <Card bodyClass="tight">
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <textarea
                    rows={3}
                    value={prompt}
                    placeholder="Escribe tu peticion a la IA… (Ctrl+Enter para enviar). Ej.: Crea un agente que revise mis presupuestos y me avise de los vencidos."
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
                    }}
                  />
                </div>
                <div className="stack-sm">
                  <button className="btn primary" onClick={enviar} disabled={ejecutando || !prompt.trim()}>
                    {ejecutando ? <><span className="spinner" /> Pensando</> : 'Enviar'}
                  </button>
                  {ejecutando && <button className="btn" onClick={cancelar}>Detener</button>}
                </div>
              </div>
              <div className="row row-tight tiny muted" style={{ marginTop: 8 }}>
                <span>Agente: <b>{settings?.agent || 'build'}</b></span>
                <span>·</span>
                <span>Directorio: <span className="mono">{cwd || 'home'}</span></span>
                <span className="spacer" />
                <span>Ctrl+Enter envia · la IA trabaja con el motor y los modelos que elijas en Configuración</span>
              </div>
            </Card>
          ) : (
            <Card bodyClass="tight">
              <div className="row">
                <input type="text" value={cwdInput} onChange={(e) => setCwdInput(e.target.value)} placeholder="Directorio de trabajo" className="mono" />
                <button className="btn sm" onClick={async () => {
                  const r = await api.terminal.cwd(cwdInput);
                  setCwd(r.cwd); push(`Terminal en ${r.cwd}`, 'success');
                }}>Abrir aqui</button>
              </div>
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Sesion real de shell en tu sistema. Sirve para git, npm, python y cualquier herramienta instalada.
              </div>
            </Card>
          )}
        </div>

        <div className="stack" style={{ minHeight: 0 }}>
          <Card title="Estado del motor" icon="🧠">
            <dl className="kv">
              <dt>Proveedor</dt><dd>{settings?.provider || 'opencode'}</dd>
              <dt>Modelo</dt><dd className="mono tiny">{modeloActual}</dd>
              <dt>Agente</dt><dd>{settings?.agent || 'build'}</dd>
              <dt>OpenCode</dt><dd className="mono tiny">{info?.paths?.opencode || 'no detectado'}</dd>
              <dt>Credenciales</dt><dd className="mono tiny">{info?.paths?.opencodeAuth || '-'}</dd>
            </dl>
            <div className="row row-tight" style={{ marginTop: 10 }}>
              {AGENTES.map((a) => (
                <button key={a} className={`chip ${settings?.agent === a ? 'on' : ''}`} onClick={() => api.settings.set({ agent: a }).then(() => push(`Agente: ${a}`, 'success'))}>{a}</button>
              ))}
            </div>
          </Card>

          <Card title="Historial reciente" icon="🕘" className="" bodyClass="tight">
            {historial.length === 0 ? (
              <div className="empty small">Sin conversaciones todavia.<br />Escribe tu primera peticion arriba.</div>
            ) : (
              <div className="stack-sm max-h-420 scroll-y">
                {historial.map((h) => (
                  <div key={h.id} className="card card-body" style={{ boxShadow: 'none', padding: 10 }}>
                    <div className="tiny muted">{haceCuanto(h.at)}</div>
                    <div className="small bold truncate">{h.prompt}</div>
                    <pre className="code" style={{ maxHeight: 120, marginTop: 6, fontSize: 11 }}>{h.texto.slice(0, 900)}</pre>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}