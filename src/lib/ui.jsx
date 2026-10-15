import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------- Toasts -------------------------------- */
const ToastCtx = createContext({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'info', ttl = 4500) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, message, kind }]);
    if (ttl) setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.kind === 'error' ? '⛔' : t.kind === 'success' ? '✅' : t.kind === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ Primitivas ----------------------------- */
export function Card({ title, subtitle, actions, children, className = '', bodyClass = '', icon }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {icon && <span style={{ fontSize: 17 }}>{icon}</span>}
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="tiny muted">{subtitle}</div>}
          </div>
          {actions && <div className="spacer" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </header>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <header className="modal-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn ghost icon" onClick={onClose} title="Cerrar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, required }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Meter({ value = 0, tone, big }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const auto = pct >= 70 ? 'success' : pct >= 40 ? '' : pct > 0 ? 'warning' : 'danger';
  return <div className={`meter ${tone || auto} ${big ? 'big' : ''}`}><span style={{ width: `${pct}%` }} /></div>;
}

export function BarRow({ name, value, suffix = '%' }) {
  return (
    <div className="bar-row">
      <div className="name" title={name}>{name}</div>
      <Meter value={value} />
      <div className="val">{Math.round(value || 0)}{suffix}</div>
    </div>
  );
}

export function Empty({ icon = '📭', title, text, action }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {title && <h3>{title}</h3>}
      {text && <p className="small">{text}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Loading({ text = 'Cargando...' }) {
  return (
    <div className="empty">
      <span className="spinner lg" />
      <p className="small" style={{ marginTop: 12 }}>{text}</p>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="row row-tight" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 16, flexWrap: 'nowrap', overflowX: 'auto' }}>
      {tabs.map((t) => (
        <button key={t.id} className={`btn sm ${value === t.id ? 'primary' : 'ghost'}`} onClick={() => onChange(t.id)}>
          {t.icon && <span>{t.icon}</span>} {t.label}
          {t.count != null && <span className="chip static" style={{ padding: '0 6px' }}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Boton "volver al inicio" presente en todos los formularios */
export function BackHome({ onBack = () => window.location.hash = '#/inicio', label = 'Volver al inicio', extra }) {
  return (
    <div className="row" style={{ marginBottom: 16 }}>
      <button className="btn ghost" onClick={onBack}>← {label}</button>
      {extra}
    </div>
  );
}

export function useAsync(fn, deps = [], initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      if (mounted.current) setData(res);
      return res;
    } catch (e) {
      if (mounted.current) setError(e.message);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload, setData };
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 30 }}>
        <div className="alert error" style={{ marginBottom: 16 }}>
          <span>⛔</span>
          <div>
            <b>Se ha producido un error en este apartado</b>
            <div className="small">{String(error.message || error)}</div>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
          <button className="btn primary" onClick={() => { window.location.hash = '#/inicio'; this.setState({ error: null }); }}>Volver al inicio</button>
        </div>
      </div>
    );
  }
}

export const THEMES = [
  { id: 'claro', name: 'Blanco', sw: ['#ffffff', '#f4f6f9', '#1d4ed8'] },
  { id: 'grafito', name: 'Grafito', sw: ['#171a21', '#0f1115', '#5b8cff'] },
  { id: 'medianoche', name: 'Medianoche', sw: ['#111c31', '#0b1220', '#3b82f6'] },
  { id: 'esmeralda', name: 'Esmeralda', sw: ['#ffffff', '#f2f8f5', '#047857'] },
  { id: 'bosque', name: 'Bosque', sw: ['#ffffff', '#f2f7f2', '#166534'] },
  { id: 'ambar', name: 'Ambar', sw: ['#ffffff', '#fdf8f1', '#b45309'] },
  { id: 'arena', name: 'Arena', sw: ['#ffffff', '#f7f5f1', '#7a5c3e'] },
  { id: 'vino', name: 'Vino', sw: ['#ffffff', '#faf5f7', '#9f1239'] },
  { id: 'ciruela', name: 'Ciruela', sw: ['#ffffff', '#f8f5fb', '#7c3aed'] },
  { id: 'cobalto', name: 'Cobalto', sw: ['#ffffff', '#f4f5fb', '#4338ca'] },
  { id: 'oceano', name: 'Oceano', sw: ['#ffffff', '#f1f8f9', '#0e7490'] }
];