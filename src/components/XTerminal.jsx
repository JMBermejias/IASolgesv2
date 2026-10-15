import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api.js';

/**
 * Terminal embebida.
 * - Con `sessionId`+`shell`, abre una sesion PTY real del sistema.
 * - Con `feed`, escribe el texto que llega por streaming (La Fabrica / IA).
 */
export default function XTerminal({
  sessionId,
  shell = false,
  cwd,
  feed,
  onReady,
  autoResize = true,
  fontSize = 12.5
}) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const unsubRef = useRef(null);
  const pendingRef = useRef('');

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace',
      fontSize,
      convertEol: false,
      cursorBlink: true,
      scrollback: 20000,
      theme: {
        background: '#0f1115',
        foreground: '#d7e0ec',
        cursor: '#5b8cff',
        selectionBackground: '#1d4ed8',
        black: '#0f1115', red: '#f87171', green: '#4ade80', yellow: '#fcd34d',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e5e7eb',
        brightBlack: '#64748b', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f8fafc'
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;

    if (hostRef.current) {
      term.open(hostRef.current);
      try { fit.fit(); } catch (_) { /* ignore */ }
    }
    onReady?.(term);

    if (autoResize) {
      const ro = new ResizeObserver(() => {
        try { fit.fit(); } catch (_) { /* ignore */ }
        if (shell && termRef.current?.__sessionId) {
          api.terminal.resize(termRef.current.__sessionId, term.cols, term.rows);
        }
      });
      if (hostRef.current) ro.observe(hostRef.current);
      unsubRef.current = () => ro.disconnect();
    }

    return () => {
      try { unsubRef.current?.(); } catch (_) { /* ignore */ }
      try { term.dispose(); } catch (_) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Sesion PTY real */
  useEffect(() => {
    let cancelled = false;
    const offData = api.terminal.onData(({ id, data }) => {
      if (termRef.current && id === termRef.current.__sessionId) termRef.current.write(data);
    });
    const offClose = api.terminal.onClose(({ id, code }) => {
      if (termRef.current && id === termRef.current.__sessionId) {
        termRef.current.write(`\r\n\x1b[90m[sesion terminada · codigo ${code}]\x1b[0m\r\n`);
      }
    });

    if (shell) {
      api.terminal.create({ id: sessionId, cwd })
        .then((s) => {
          if (cancelled || !termRef.current) return;
          termRef.current.__sessionId = s.id;
          try { fitRef.current.fit(); } catch (_) { /* ignore */ }
        })
        .catch((e) => termRef.current?.write(`\x1b[31mNo se pudo abrir la terminal: ${e.message}\x1b[0m\r\n`));
    } else if (sessionId && termRef.current) {
      termRef.current.__sessionId = sessionId;
    }

    return () => {
      cancelled = true;
      offData();
      offClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, sessionId, cwd]);

  /* Entrada del usuario */
  useEffect(() => {
    if (!shell || !termRef.current) return undefined;
    const term = termRef.current;
    const dataDisp = term.onData(async (data) => {
      const sid = term.__sessionId;
      if (sid) await api.terminal.write(sid, data);
    });
    return () => dataDisp.dispose();
  }, [shell]);

  /* Streaming de texto externo (IA / Fabrica) */
  useEffect(() => {
    if (!feed || !termRef.current) return undefined;
    pendingRef.current = '';
    const unsub = feed((text, kind = 'token') => {
      const term = termRef.current;
      if (!term) return;
      if (kind === 'raw') term.write(text);
      else if (kind === 'status') term.write(`\x1b[36m▸ ${text}\x1b[0m\r\n`);
      else if (kind === 'error') term.write(`\x1b[31m✖ ${text}\x1b[0m\r\n`);
      else if (kind === 'success') term.write(`\x1b[32m✔ ${text}\x1b[0m\r\n`);
      else if (kind === 'warn') term.write(`\x1b[33m⚠ ${text}\x1b[0m\r\n`);
      else if (kind === 'out') {
        const buf = pendingRef.current + text;
        const lines = buf.split('\n');
        pendingRef.current = lines.pop();
        for (const l of lines) term.write(`\x1b[90m$\x1b[0m ${l}\r\n`);
      } else term.write(text);
    });
    return unsub;
  }, [feed]);

  return <div ref={hostRef} className="terminal-body" style={{ height: '100%', minHeight: 0 }} />;
}