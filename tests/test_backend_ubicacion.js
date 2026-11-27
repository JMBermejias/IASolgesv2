/**
 * IASolges.v2 - El buscador debe centrarse en la ubicacion que se le pasa.
 * Los servidores publicos se simulan para que la prueba sea rapida y estable.
 * Ejecutar: node tests/test_backend_ubicacion.js
 */
const customers = require('../electron/customers.js');

let ok = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { ok++; console.log(`  \x1b[32mOK\x1b[0m   ${label}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${label}  ${extra}`); }
};

const centros = {
  novelda: { lat: '38.3842', lon: '-0.7674', display_name: 'Novelda, Alicante, España' },
  alicante: { lat: '38.3436', lon: '-0.4881', display_name: 'Alicante, España' },
  benidorm: { lat: '38.5406', lon: '-0.1291', display_name: 'Benidorm, Alicante, España' }
};
const fetchReal = global.fetch;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('overpass')) return { ok: true, status: 200, text: async () => '{"elements":[]}' };
  if (u.includes('nominatim') && u.includes('limit=8')) {
    const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '').toLowerCase();
    const clave = Object.keys(centros).find((k) => q.includes(k));
    const d = centros[clave] || centros.novelda;
    return { ok: true, status: 200, text: async () => JSON.stringify([
      Object.assign({ type: 'city', category: 'place', boundingbox: [] }, d)
    ]) };
  }
  if (u.includes('nominatim')) return { ok: true, status: 200, text: async () => '[]' };
  return fetchReal(url);
};

(async () => {
  console.log('\n=== Ubicacion escrita -> centro del mapa ===');
  for (const [consulta, nombre, lat, lon] of [
    ['Novelda, Alicante', 'Novelda', 38.3842, -0.7674],
    ['Alicante', 'Alicante', 38.3436, -0.4881],
    ['Benidorm', 'Benidorm', 38.5406, -0.1291]
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await customers.search({ query: consulta, category: 'todos', radius: 3, limit: 10, incluirPequenos: false });
    check(`"${consulta}" se centra en ${nombre}`,
      r.center.label.includes(nombre) && Math.abs(r.center.lat - lat) < 0.001 && Math.abs(r.center.lon - lon) < 0.001,
      JSON.stringify(r.center));
  }

  console.log(`\n${'='.repeat(52)}\n  ${ok} correctos | ${fail} fallidos\n${'='.repeat(52)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
