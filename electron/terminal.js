/**
 * IASolges.v2 - Terminal integrada (shell del sistema con PTY emulado via `script`)
 */
const { spawn, spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { getSettings } = require('./config');

const sessions = new Map();
const bus = new EventEmitter();
bus.setMaxListeners(200);

function emit(channel, payload) {
  bus.emit(channel, payload);
}

function hasBinary(bin) {
  try {
    return spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).status === 0;
  } catch (_) { return false; }
}

function defaultShell() {
  const cfg = getSettings().terminal || {};
  if (cfg.shell && fs_exists(cfg.shell)) return cfg.shell;
  for (const s of ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh']) {
    if (fs_exists(s)) return s;
  }
  return '/bin/sh';
}

function fs_exists(p) {
  try { return require('fs').accessSync(p); } catch (_) { return false; }
}

function cwdDefault() {
  const cfg = getSettings().terminal || {};
  return cfg.cwd && fs_exists(cfg.cwd) ? cfg.cwd : os.homedir();
}

/** Crea una sesion de terminal. Devuelve el id. */
function create({ id, cwd, shell, env, cols = 100, rows = 28 } = {}) {
  const sid = id || `term_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const workdir = cwd && fs_exists(cwd) ? cwd : cwdDefault();
  const sh = shell || defaultShell();
  const shellName = path.basename(sh);

  const usePty = hasBinary('script');
  let child;
  let mode;

  if (usePty) {
    // `script` crea un pseudo-terminal real: prompt, colores y edicion funcionan.
    child = spawn('script', ['-qfec', `${shellName} --noprofile --norc -i`, '/dev/null'], {
      cwd: workdir,
      env: { ...process.env, ...(env || {}), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    mode = 'pty';
  } else {
    child = spawn(shellName, ['--noprofile', '--norc', '-i'], {
      cwd: workdir,
      env: { ...process.env, ...(env || {}), TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    mode = 'pipe';
  }

  const session = { id: sid, child, cwd: workdir, shell: sh, mode, alive: true, createdAt: Date.now() };
  sessions.set(sid, session);

  const forward = (stream, chunk) => emit('terminal:data', { id: sid, data: chunk.toString() });
  child.stdout.on('data', (c) => forward('stdout', c));
  child.stderr.on('data', (c) => forward('stderr', c));
  child.on('error', (err) => emit('terminal:data', { id: sid, data: `\r\n\x1b[31m[error] ${err.message}\x1b[0m\r\n` }));
  child.on('close', (code) => {
    session.alive = false;
    emit('terminal:close', { id: sid, code });
    sessions.delete(sid);
  });

  emit('terminal:open', { id: sid, cwd: workdir, shell: sh, mode, cols, rows });
  return { id: sid, cwd: workdir, shell: sh, mode };
}

function write(id, data) {
  const s = sessions.get(id);
  if (!s || !s.alive) return false;
  try { s.child.stdin.write(data); return true; } catch (_) { return false; }
}

function resize(id, cols, rows) {
  const s = sessions.get(id);
  if (!s) return false;
  if (s.mode === 'pty') {
    // Informe de tamaño de pseudo-terminal (xterm.js lo interpreta y se reajusta)
    try { s.child.stdin.write(`\x1b[8;${Math.max(3, rows)};${Math.max(20, cols)}t`); } catch (_) { /* ignore */ }
  }
  return true;
}

function close(id) {
  const s = sessions.get(id);
  if (!s) return false;
  try { s.child.kill('SIGKILL'); } catch (_) { /* ignore */ }
  sessions.delete(id);
  return true;
}

function killAll() {
  for (const id of [...sessions.keys()]) close(id);
}

function list() {
  return [...sessions.values()].map((s) => ({ id: s.id, cwd: s.cwd, alive: s.alive, mode: s.mode }));
}

/** Ejecuta un comando y devuelve stdout/stderr (para tareas internas: git, npm...) */
function exec(command, { cwd = os.homedir(), timeout = 120000, env } = {}) {
  const res = spawnSync('bash', ['-lc', command], {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...(env || {}) }
  });
  return {
    ok: res.status === 0,
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.status === 0 ? null : (res.stderr || res.error?.message || 'Error')
  };
}

module.exports = { create, write, resize, close, killAll, list, exec, bus, cwdDefault, defaultShell };