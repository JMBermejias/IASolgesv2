import React, { useState } from 'react';
import { THEMES } from '../lib/ui.jsx';

export default function Topbar({ view, info, settings, update, collapsed, onToggleSidebar, onNavigate, onSettingsChange }) {
  const [showThemes, setShowThemes] = useState(false);

  const setTheme = async (id) => {
    await onSettingsChange({ theme: id });
    setShowThemes(false);
  };

  return (
    <header className="topbar">
      <button className="btn ghost icon" onClick={onToggleSidebar} title={collapsed ? 'Mostrar menu' : 'Ocultar menu'}>
        {collapsed ? '☰' : '⏷'}
      </button>
      <div>
        <h1>{info?.title || 'IASolges.v2'}</h1>
        <div className="topbar-sub">{info?.subtitle || ''}</div>
      </div>

      <div className="topbar-actions">
        <span className="chip primary nowrap" title="Proveedor y modelo de IA activos">
          🤖 {settings?.provider === 'opencode' ? 'OpenCode' : settings?.provider}
          {settings?.models?.[settings?.provider] ? ` · ${String(settings.models[settings.provider]).split('/').pop()}` : ''}
        </span>

        {update?.available && (
          <button className="btn sm" onClick={() => onNavigate('configuracion', 'actualizaciones')}>
            ⬆️ Nueva version {update.latest?.tag}
          </button>
        )}

        <div style={{ position: 'relative' }}>
          <button className="btn ghost icon" onClick={() => setShowThemes((v) => !v)} title="Cambiar tema de color">🎨</button>
          {showThemes && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowThemes(false)} />
              <div
                className="card"
                style={{ position: 'absolute', right: 0, top: 44, width: 320, zIndex: 50, padding: 12, boxShadow: 'var(--shadow-lg)' }}
              >
                <div className="bold small" style={{ marginBottom: 8 }}>Tema de la aplicacion</div>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <button key={t.id} className={`theme-card ${settings?.theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
                      <div className="theme-swatches">
                        {t.sw.map((c, i) => <span key={i} style={{ background: c }} />)}
                      </div>
                      <div className="small bold">{t.name}</div>
                    </button>
                  ))}
                </div>
                <button className="btn block sm" style={{ marginTop: 10 }} onClick={() => onNavigate('configuracion', 'apariencia')}>
                  Mas opciones de apariencia
                </button>
              </div>
            </>
          )}
        </div>

        <button className="btn ghost icon" onClick={() => onNavigate('configuracion')} title="Configuracion">⚙️</button>
        <button className="btn ghost icon" onClick={() => onNavigate('credenciales')} title="Credenciales">🔑</button>
        <button className="btn ghost icon" onClick={() => window.api.exit()} title="Salir de la aplicacion" style={{ color: 'var(--danger)' }}>⏻</button>
      </div>
    </header>
  );
}