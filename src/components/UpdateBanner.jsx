import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/** Banner de actualizacion: descarga el .deb desde GitHub, instala y reinicia */
export default function UpdateBanner({ update, onClose, push }) {
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState(null);
  const [info, setInfo] = useState(null);

  if (update.dismissed) return null;

  useEffect(() => {
    const offP = api.update.onProgress((p) => setProgress(p));
    const offS = api.update.onStatus((s) => setProgress({ status: s.message }));
    return () => { offP?.(); offS?.(); };
  }, []);

  const run = async () => {
    try {
      setState('downloading');
      const file = await api.update.download();
      setInfo(file);
      setState('installing');
      const res = await api.update.install(file.dest);
      if (res.ok) {
        push('Actualización instalada. Reiniciando...', 'success');
      } else {
        push(`No se pudo instalar automáticamente: ${res.error}`, 'error', 9000);
        setState('error');
        setInfo({ ...info, error: res.error });
      }
    } catch (e) {
      push(e.message, 'error', 8000);
      setState('error');
    }
  };

  return (
    <div style={{ padding: '12px 22px 0' }}>
      <div className="alert info" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>⬆️</span>
        <div style={{ flex: 1 }}>
          <b>Nueva version disponible: {update.latest?.tag}</b>
          <div className="small" style={{ marginTop: 2 }}>
            Tu version actual es {update.current}. Se descargara el paquete .deb desde GitHub, se instalara y la aplicacion se reiniciara automaticamente.
          </div>
          {progress?.percent != null && (
            <div style={{ marginTop: 8, maxWidth: 420 }}>
              <div className="meter"><span style={{ width: `${progress.percent}%` }} /></div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {progress.status || `Descargando… ${progress.percent}% (${(progress.received / 1048576).toFixed(1)} MB)`}
              </div>
            </div>
          )}
          {state === 'installing' && <div className="tiny muted" style={{ marginTop: 6 }}>Instalando el paquete…</div>}
          {info?.error && <div className="tiny" style={{ marginTop: 6, color: 'var(--danger)' }}>{info.error}</div>}
        </div>
        <div className="row row-tight">
          <button className="btn sm" onClick={() => api.openExternal(update.latest?.url)}>Ver notas</button>
          <button className="btn primary sm" onClick={run} disabled={state === 'downloading' || state === 'installing'}>
            {state === 'downloading' || state === 'installing' ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
          <button className="btn ghost sm" onClick={onClose}>Ahora no</button>
        </div>
      </div>
    </div>
  );
}