import React from 'react';

const NAV = [
  { id: 'inicio', label: 'Inicio', icon: '🏠', group: 'Principal' },
  { id: 'localización', label: 'Localización de clientes', icon: '📍', group: 'Comercial' },
  { id: 'presupuestos', label: 'Presupuestos', icon: '📄', group: 'Comercial' },
  { id: 'fabrica', label: 'La Fábrica', icon: '🏭', group: 'Producción' },
  { id: 'legal', label: 'Análisis legal', icon: '⚖️', group: 'Producción' },
  { id: 'terminal', label: 'Terminal IA', icon: '⬛', group: 'Herramientas' },
  { id: 'configuración', label: 'Configuración', icon: '⚙️', group: 'Herramientas' },
  { id: 'credenciales', label: 'Credenciales', icon: '🔑', group: 'Herramientas' }
];

export default function Sidebar({ route, collapsed, settings, onNavigate }) {
  const exit = async () => {
    const ok = window.confirm('¿Seguro que quieres salir de IASolges.v2?');
    if (ok) await api_exit();
  };
  const api_exit = () => window.api.exit();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-head">
        <div className="sidebar-logo">IA</div>
        {!collapsed && (
          <div className="sidebar-title">
            <b>IASolges.v2</b>
            <small>{settings?.provider === 'opencode' ? 'Motor: OpenCode' : `Motor: ${settings?.provider || 'OpenCode'}`}</small>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          const prev = NAV[i - 1];
          const showGroup = !collapsed && (!prev || prev.group !== item.group);
          return (
            <React.Fragment key={item.id}>
              {showGroup && <div className="sidebar-group">{item.group}</div>}
              <button
                className={`nav-item ${route.view === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={item.label}
              >
                <span className="ico">{item.icon}</span>
                <span className="label">{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <button className="nav-item" onClick={exit} title="Salir de la aplicación" style={{ color: 'var(--danger)' }}>
          <span className="ico" style={{ color: 'var(--danger)' }}>⏻</span>
          <span className="label">Salir</span>
        </button>
        {!collapsed && (
          <div className="tiny muted center" style={{ padding: '6px 0 2px' }}>
            v2.0.0 · MIT © Jose Manuel Bernabeu Mejias
          </div>
        )}
      </div>
    </aside>
  );
}