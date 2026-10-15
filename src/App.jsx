import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary, ToastProvider, useToast } from './lib/ui.jsx';
import { api } from './lib/api.js';

import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';

import Dashboard from './views/Dashboard.jsx';
import Localizacion from './views/Localizacion.jsx';
import Presupuestos from './views/Presupuestos.jsx';
import Fabrica from './views/Fabrica.jsx';
import Legal from './views/Legal.jsx';
import TerminalIA from './views/TerminalIA.jsx';
import Configuracion from './views/Configuracion.jsx';
import Credenciales from './views/Credenciales.jsx';

const VIEWS = {
  inicio: { title: 'Inicio', subtitle: 'Panel de control: trabajos, clientes y presupuestos' },
  localizacion: { title: 'Localizacion de clientes', subtitle: 'Busca, analiza y selecciona clientes en el mapa' },
  presupuestos: { title: 'Presupuestos', subtitle: 'Creacion automatica de presupuestos con IA' },
  fabrica: { title: 'La Fabrica', subtitle: 'Creacion de agentes, webs y aplicaciones con IA' },
  legal: { title: 'Analisis legal', subtitle: 'Auditoria legal y de cumplimiento' },
  terminal: { title: 'Terminal IA', subtitle: 'Consola directa con el proveedor de inteligencia artificial' },
  configuracion: { title: 'Configuracion', subtitle: 'Proveedores, modelos, temas y actualizaciones' },
  credenciales: { title: 'Credenciales', subtitle: 'Datos del titular, licencia MIT y acceso a GitHub' }
};

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [view = 'inicio', id = ''] = raw.split('/');
  return { view: VIEWS[view] ? view : 'inicio', id: decodeURIComponent(id) };
}

function Shell() {
  const { push } = useToast();
  const [route, setRoute] = useState(parseHash);
  const [settings, setSettings] = useState(null);
  const [info, setInfo] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [update, setUpdate] = useState(null);
  const [booting, setBooting] = useState(true);

  const navigate = useCallback((view, id = '') => {
    window.location.hash = `#/${view}${id ? `/${id}` : ''}`;
    setRoute({ view, id });
  }, []);

  const reloadSettings = useCallback(async () => {
    const s = await api.settings.get().catch(() => null);
    if (s) {
      setSettings(s);
      document.documentElement.setAttribute('data-theme', s.theme || 'claro');
      setCollapsed(Boolean(s.ui?.sidebarCollapsed));
    }
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      const [inf] = await Promise.all([api.info().catch((e) => ({ error: e.message })), reloadSettings()]);
      setInfo(inf);
      setBooting(false);
    })();
  }, [reloadSettings]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    const offNav = api.onNavigate(({ view, id }) => navigate(view, id));
    const offUpd = api.update.onInfo((u) => { if (u) setUpdate(u); });
    return () => { window.removeEventListener('hashchange', onHash); offNav?.(); offUpd?.(); };
  }, [navigate]);

  const onSettingsChange = useCallback(async (patch) => {
    const s = await api.settings.set(patch);
    setSettings(s);
    document.documentElement.setAttribute('data-theme', s.theme || 'claro');
    return s;
  }, []);

  const toggleSidebar = useCallback(async () => {
    const next = !collapsed;
    setCollapsed(next);
    await api.settings.set({ ui: { ...(settings?.ui || {}), sidebarCollapsed: next } }).catch(() => {});
  }, [collapsed, settings]);

  const ctx = useMemo(() => ({ settings, info, update, setUpdate, reloadSettings, navigate, push }), [settings, info, update, reloadSettings, navigate, push]);

  const View = {
    inicio: Dashboard,
    localizacion: Localizacion,
    presupuestos: Presupuestos,
    fabrica: Fabrica,
    legal: Legal,
    terminal: TerminalIA,
    configuracion: Configuracion,
    credenciales: Credenciales
  }[route.view] || Dashboard;

  if (booting) {
    return (
      <div className="app">
        <div className="main">
          <div className="content">
            <div className="empty">
              <span className="spinner lg" />
              <p className="small" style={{ marginTop: 14 }}>Arrancando IASolges.v2…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar route={route} collapsed={collapsed} settings={settings} onNavigate={navigate} />
      <div className="main">
        <Topbar
          view={route.view}
          info={VIEWS[route.view]}
          settings={settings}
          update={update}
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onNavigate={navigate}
          onSettingsChange={onSettingsChange}
        />
        {update?.available && <UpdateBanner update={update} onClose={() => setUpdate((u) => ({ ...u, dismissed: true }))} push={push} />}
        <div className={`content ${['terminal'].includes(route.view) ? 'no-pad' : ''}`}>
          <ErrorBoundary key={`${route.view}-${route.id}`}>
            <View {...ctx} id={route.id} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}