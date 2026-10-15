import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { BackHome, Card, Loading, useToast } from '../lib/ui.jsx';

export default function Credenciales({ info, settings, navigate }) {
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [revelar, setRevelar] = useState(false);

  useEffect(() => { api.credentials(revelar).then(setData).catch((e) => push(e.message, 'error')); }, [revelar]); // eslint-disable-line

  if (!data) return <Loading text="Cargando credenciales..." />;

  const copiar = async (texto, etiqueta) => {
    await navigator.clipboard.writeText(texto);
    push(`${etiqueta} copiado al portapapeles`, 'success');
  };

  const t = data.titular;

  return (
    <div className="stack">
      <BackHome extra={<button className="btn sm" onClick={() => navigate('configuracion', 'github')}>⚙️ Editar credenciales</button>} />

      <Card icon="🔑" title="Credenciales del titular" subtitle="Datos del propietario y autor de IASolges.v2">
        <div className="grid grid-2">
          <div className="stack-sm">
            <div className="row">
              <div className="icon-badge" style={{ width: 46, height: 46, fontSize: 20 }}>JM</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{t.nombre}</div>
                <div className="small muted">Autor y titular de la aplicacion · Licencia MIT</div>
              </div>
            </div>
            <div className="divider" />
            <dl className="kv">
              <dt>Nombre</dt><dd>{t.nombre}</dd>
              <dt>Domicilio</dt><dd>{t.direccion}</dd>
              <dt>Correo</dt><dd>{t.email}</dd>
              <dt>Usuario GitHub</dt><dd className="mono">{t.usuario}</dd>
              <dt>Repositorio</dt><dd><a href={t.repositorio} onClick={(e) => { e.preventDefault(); api.openExternal(t.repositorio); }}>{t.repositorio}</a></dd>
            </dl>
            <div className="row row-tight">
              <button className="btn sm" onClick={() => copiar(`${t.nombre}\n${t.direccion}`, 'Datos del titular')}>📋 Copiar datos</button>
              <button className="btn sm" onClick={() => api.openExternal(t.repositorio)}>🐙 Abrir repositorio</button>
            </div>
          </div>

          <div className="stack-sm">
            <h3>Acceso a GitHub</h3>
            <dl className="kv">
              <dt>Usuario</dt><dd className="mono">{data.github.user}</dd>
              <dt>Repositorio</dt><dd className="mono">{data.github.repo}</dd>
              <dt>URL</dt><dd className="mono tiny">{data.github.url}</dd>
              <dt>Token</dt>
              <dd className="mono">
                {data.github.tokenCompleto ? data.github.token : 'No configurado'}
                {data.github.tokenCompleto && (
                  <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setRevelar((v) => !v)}>
                    {revelar ? '🙈 Ocultar' : '👁 Mostrar'}
                  </button>
                )}
                {data.github.tokenCompleto && (
                  <button className="btn ghost sm" onClick={() => copiar(data.github.token, 'Token')} title="Copiar">📋</button>
                )}
              </dd>
            </dl>
            <div className="alert warn small">
              <div>
                <b>Importante:</b> este token da acceso completo al repositorio. Guardalo de forma privada y no lo publiques en otros repositorios.
                Puedes revocarlo en GitHub → Settings → Developer settings → Personal access tokens.
              </div>
            </div>
            <h3 style={{ marginTop: 8 }}>Licencia MIT</h3>
            <pre className="code" style={{ maxHeight: 260, fontSize: 11 }}>{data.licencia.texto}</pre>
            <div className="row row-tight">
              <button className="btn sm" onClick={() => copiar(data.licencia.texto, 'Licencia MIT')}>📋 Copiar licencia</button>
              <button className="btn sm" onClick={async () => {
                await api.files.save({ name: 'LICENSE-IASolges-v2.txt', content: data.licencia.texto, filters: [{ name: 'Texto', extensions: ['txt'] }] });
              }}>💾 Guardar licencia</button>
            </div>
          </div>
        </div>
      </Card>

      <Card icon="🏷️" title="Aplicacion" icon2="">
        <div className="grid grid-4">
          <div className="kpi" style={{ padding: 0 }}><div className="label">Version</div><div className="value">{info?.version}</div></div>
          <div className="kpi" style={{ padding: 0 }}><div className="label">Licencia</div><div className="value">MIT</div></div>
          <div className="kpi" style={{ padding: 0 }}><div className="label">Motor IA</div><div className="value" style={{ fontSize: 20 }}>{settings?.provider}</div></div>
          <div className="kpi" style={{ padding: 0 }}><div className="label">Titular</div><div className="value" style={{ fontSize: 16 }}>J. M. Bernabeu</div></div>
        </div>
      </Card>
    </div>
  );
}