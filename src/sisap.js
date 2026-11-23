// Robot que consulta el SISAP (Midagri) y guarda el precio mayorista promedio del día.

export const REGIONES = [
  ['010000', 'amazonas'], ['020000', 'ancash'], ['030000', 'apurimac'], ['030201', 'andahuaylas'],
  ['040000', 'arequipa'], ['050000', 'ayacucho'], ['060000', 'cajamarca'], ['060401', 'chota'],
  ['060801', 'jaen'], ['070000', 'callao'], ['080000', 'cusco'], ['090000', 'huancavelica'],
  ['100000', 'huanuco'], ['110000', 'ica'], ['120000', 'junin'], ['130000', 'lalibertad'],
  ['140000', 'lambayeque'], ['150000', 'lima'], ['160000', 'loreto'], ['170000', 'madrededios'],
  ['180000', 'moquegua'], ['190000', 'pasco'], ['200000', 'piura'], ['210000', 'puno'],
  ['220000', 'sanmartin'], ['230000', 'tacna'], ['240000', 'tumbes'], ['250000', 'ucayali']
];

// Códigos de los 51 grupos de productos del SISAP de ciudades.
const PRODUCTOS = ('1001 1018 0202 0203 0204 0401 0301 1005 0101 1101 0212 0641 0603 0403 1010 0607 ' +
  '0501 0302 1305 0502 0608 0303 1011 1105 1104 0504 0611 0614 0615 0617 0620 0619 0622 0102 0506 ' +
  '0626 0104 0627 0631 1201 0628 0629 0405 0633 0306 0228 0637 0229 0105 0230 0231').split(' ');

export function urlConsulta(base, region, fechaISO) {
  const [a, m, d] = fechaISO.split('-');
  const p = new URLSearchParams();
  p.append('region', region);
  p.append('variables[]', 'may_precio_prom');
  p.append('fecha', `${d}/${m}/${a}`);
  for (const c of PRODUCTOS) p.append('productos[]', c);
  p.append('periodicidad', 'dia');
  p.append('__ajax_carga_final', 'consulta');
  p.append('ajax', 'true');
  return `${base}/resumenes/filtrar?${p.toString()}`;
}

const ENT = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á',
  Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', amp: '&', nbsp: ' ', quot: '"', lt: '<', gt: '>' };
function limpiar(t) {
  return t.replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-zA-Z]+);/g, (m, e) => e[0] === '#' ? String.fromCharCode(+e.slice(1)) : (ENT[e] ?? m))
    .replace(/\s+/g, ' ').trim();
}

// Devuelve [[nombre, unidad, precio|null], ...] o null si el SISAP no tiene tabla para ese día.
export function leerTabla(html) {
  const out = [];
  const re = /<tr[^>]*class=["']?contenido["']?[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const celdas = m[1].split(/<td[^>]*>/i).slice(1).map(limpiar);
    if (celdas.length < 4) continue;
    const nombre = celdas[0];
    if (!nombre) continue;
    const n = parseFloat(celdas[3].replace(',', '.'));
    out.push([nombre, celdas[1] || '', Number.isFinite(n) ? n : null]);
  }
  return out.length ? out : null;
}

export async function consultarRegion(base, region, fechaISO) {
  const r = await fetch(urlConsulta(base, region, fechaISO), {
    headers: { 'User-Agent': 'Mozilla/5.0 (precios GEC; consulta 4 veces al dia)', 'X-Requested-With': 'XMLHttpRequest' },
    cf: { cacheTtl: 0 }
  });
  if (!r.ok) throw new Error('SISAP respondió ' + r.status);
  const html = new TextDecoder('windows-1252').decode(await r.arrayBuffer());
  return leerTabla(html);
}

// Une lo nuevo con lo guardado: un precio que ya teníamos no se pierde si luego sale en blanco.
export function unir(viejo, nuevo) {
  if (!nuevo) return viejo || null;
  if (!viejo) return nuevo;
  const mapa = new Map(viejo.map(p => [p[0], p]));
  for (const p of nuevo) {
    const ant = mapa.get(p[0]);
    if (!ant || p[2] !== null) mapa.set(p[0], p);
  }
  return [...mapa.values()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

export function fechaLima(desfaseDias = 0) {
  const t = Date.now() - 5 * 3600e3 + desfaseDias * 86400e3;
  return new Date(t).toISOString().slice(0, 10);
}

export const SISAP_BASE = 'http://sistemas.midagri.gob.pe/sisap/portal2/ciudades';

// consultar(codigoRegion) devuelve la tabla leída de esa ciudad (o null).
export async function actualizarDia(env, fechaISO, consultar) {
  const base = env.SISAP_URL || SISAP_BASE;
  consultar = consultar || (cod => consultarRegion(base, cod, fechaISO));
  const clave = 'dia:' + fechaISO;
  const guardado = (await env.DATOS.get(clave, 'json')) || { fecha: fechaISO, ciudades: {} };
  let ok = 0, fallos = 0;
  // De a 4 ciudades a la vez para no saturar al SISAP.
  for (let k = 0; k < REGIONES.length; k += 4) {
    const lote = REGIONES.slice(k, k + 4);
    const res = await Promise.allSettled(lote.map(([cod]) => consultar(cod)));
    res.forEach((r, j) => {
      const ciudad = lote[j][1];
      if (r.status === 'fulfilled') {
        const unido = unir(guardado.ciudades[ciudad], r.value);
        if (unido) guardado.ciudades[ciudad] = unido;
        ok++;
      } else { fallos++; }
    });
  }
  guardado.actualizado = new Date().toISOString();
  const conDatos = Object.keys(guardado.ciudades).length;
  if (conDatos > 0) {
    await env.DATOS.put(clave, JSON.stringify(guardado));
    const dias = (await env.DATOS.get('dias', 'json')) || [];
    if (!dias.includes(fechaISO)) {
      dias.push(fechaISO);
      dias.sort();
      await env.DATOS.put('dias', JSON.stringify(dias.slice(-120)));
    }
  }
  return { fecha: fechaISO, consultas: ok, fallos, ciudadesConDatos: conDatos };
}

// Lo que corre a las 9, 11, 12 y 15 h de Lima.
// Cada día se consulta en una invocación aparte (por el límite de 50 consultas externas por invocación).
export async function correrRobot(env) {
  const dias = (await env.DATOS.get('dias', 'json')) || [];
  const fechas = [fechaLima(0)];
  // El SISAP no publica todos los días: se buscan hasta 7 días atrás para tener con qué comparar.
  for (let k = 1; k <= 7; k++) {
    const f = fechaLima(-k);
    if (dias.includes(f)) continue;
    const intento = await env.DATOS.get('intento:' + f);
    if (intento && Date.now() - Number(intento) < 20 * 3600e3) continue;
    fechas.push(f);
  }
  const resultados = [];
  for (const f of fechas) {
    try {
      if (f !== fechaLima(0)) await env.DATOS.put('intento:' + f, String(Date.now()), { expirationTtl: 10 * 86400 });
      // Cada día corre en su propio «robot» (Durable Object), con su propio límite de consultas.
      const r = await env.ROBOT.get(env.ROBOT.idFromName(f)).fetch('https://robot/?fecha=' + f);
      resultados.push(await r.json());
    } catch (e) {
      resultados.push({ fecha: f, error: String(e) });
    }
  }
  await env.DATOS.put('ultimo', JSON.stringify({ cuando: new Date().toISOString(), resultados }));
  return resultados;
}

// Une el día pedido con el último día anterior en que cada ciudad tuvo precios.
export async function comparar(env, fecha) {
  const dias = ((await env.DATOS.get('dias', 'json')) || []).filter(d => d <= fecha).sort();
  const cache = new Map();
  const leer = async d => {
    if (!cache.has(d)) cache.set(d, await env.DATOS.get('dia:' + d, 'json'));
    return cache.get(d);
  };
  const actual = await leer(fecha);
  if (!actual) return null;
  // Solo se compara con el día anterior del calendario; si ese día no hay datos, no hay comparación.
  const ayer = new Date(Date.parse(fecha + 'T12:00:00Z') - 86400e3).toISOString().slice(0, 10);
  const previos = dias.filter(d => d === ayer);
  const ciudades = {};
  for (const [c, lista] of Object.entries(actual.ciudades)) {
    let antes = null;
    for (const d of previos) {
      const doc = await leer(d);
      if (doc && doc.ciudades[c] && doc.ciudades[c].some(x => x[2] !== null)) { antes = { fecha: d, productos: doc.ciudades[c] }; break; }
    }
    ciudades[c] = { hoy: lista, antes };
  }
  return { fecha, actualizado: actual.actualizado, ciudades };
}

// Guarda los precios que manda el robot de la computadora (en el Perú).
export async function guardarSubida(env, fechaISO, ciudades) {
  const clave = 'dia:' + fechaISO;
  const guardado = (await env.DATOS.get(clave, 'json')) || { fecha: fechaISO, ciudades: {} };
  const validas = new Set(REGIONES.map(r => r[1]));
  let n = 0;
  for (const [c, filas] of Object.entries(ciudades || {})) {
    if (!validas.has(c) || !Array.isArray(filas)) continue;
    const limpias = filas
      .filter(f => Array.isArray(f) && typeof f[0] === 'string' && f[0].length < 120)
      .map(f => [f[0], typeof f[1] === 'string' ? f[1].slice(0, 30) : '', (typeof f[2] === 'number' && isFinite(f[2]) && f[2] >= 0 && f[2] < 10000) ? f[2] : null])
      .slice(0, 200);
    if (!limpias.length) continue;
    const unido = unir(guardado.ciudades[c], limpias);
    if (unido) { guardado.ciudades[c] = unido; n++; }
  }
  if (!Object.keys(guardado.ciudades).length) return { fecha: fechaISO, ciudadesRecibidas: 0 };
  guardado.actualizado = new Date().toISOString();
  await env.DATOS.put(clave, JSON.stringify(guardado));
  const dias = (await env.DATOS.get('dias', 'json')) || [];
  if (!dias.includes(fechaISO)) {
    dias.push(fechaISO);
    dias.sort();
    await env.DATOS.put('dias', JSON.stringify(dias.slice(-120)));
  }
  const res = { fecha: fechaISO, ciudadesRecibidas: n, ciudadesConDatos: Object.keys(guardado.ciudades).length };
  await env.DATOS.put('ultimo', JSON.stringify({ cuando: new Date().toISOString(), origen: 'computadora', resultados: [res] }));
  return res;
}
