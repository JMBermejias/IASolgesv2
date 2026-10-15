/**
 * IASolges.v2 - Almacenamiento de datos (clientes, presupuestos, proyectos, analisis, trabajos)
 */
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./config');

const DB_FILE = path.join(dataDir, 'db.json');

const EMPTY = {
  clientes: [],
  presupuestos: [],
  proyectos: [],
  trabajos: [],
  Analyses: [],
  eventos: []
};

let db = null;

function load() {
  if (db) return db;
  try {
    if (fs.existsSync(DB_FILE)) {
      db = { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    } else {
      db = JSON.parse(JSON.stringify(EMPTY));
    }
  } catch (e) {
    console.error('[db] corrupto, se reinicia:', e.message);
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  return db;
}

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function collection(name) {
  const d = load();
  if (!Array.isArray(d[name])) d[name] = [];
  return d[name];
}

function insert(name, item) {
  const list = collection(name);
  const record = { id: uid(name.slice(0, 3)), createdAt: new Date().toISOString(), ...item };
  list.unshift(record);
  persist();
  return record;
}

function update(name, id, patch) {
  const list = collection(name);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  persist();
  return list[idx];
}

function remove(name, id) {
  const list = collection(name);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  persist();
  return true;
}

function find(name, id) {
  return collection(name).find((x) => x.id === id) || null;
}

function logEvent(type, payload) {
  try {
    const list = collection('eventos');
    list.unshift({ id: uid('evt'), type, payload, at: new Date().toISOString() });
    if (list.length > 500) list.length = 500;
    persist();
  } catch (_) { /* ignore */ }
}

module.exports = { load, persist, insert, update, remove, find, collection, logEvent, uid, DB_FILE };