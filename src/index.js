import { correrRobot, fechaLima, actualizarDia, comparar, consultarRegion, SISAP_BASE, guardarSubida } from './sisap.js';

// Huella de la clave del robot de la computadora (la clave misma está solo en robot.ps1).
const HUELLA_CLAVE = '42705b7883d21bc8db74c7345c1df58311bd95d00491821684c85ca6d6a242cf';

async function huella(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const JSON_H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_H });

async function subir(request, url, env, desdeSisap) {
  if (!desdeSisap) {
    const clave = request.headers.get('x-clave') || '';
    if (!clave || (await huella(clave)) !== HUELLA_CLAVE) return json({ error: 'clave incorrecta' }, 403);
  }
  const fecha = url.searchParams.get('fecha') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaLima(1) || fecha < fechaLima(-10)) return json({ error: 'fecha inválida' }, 400);
  let cuerpo;
  try { cuerpo = await request.json(); } catch { return json({ error: 'datos inválidos' }, 400); }
  return json(await guardarSubida(env, fecha, cuerpo && cuerpo.ciudades));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const ORIGEN_SISAP = 'http://sistemas.midagri.gob.pe';
    const origen = request.headers.get('origin') || '';
    const cors = origen === ORIGEN_SISAP ? {
      'access-control-allow-origin': ORIGEN_SISAP,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400'
    } : {};

    // Las dos páginas: el visualizador (sincronizado) y el lector (independiente).
    if (p === '/' || p === '/lector') {
      return env.ASSETS.fetch(new Request(new URL('/', url), request));
    }

    if (p === '/api/dias') {
      const dias = (await env.DATOS.get('dias', 'json')) || [];
      const res = json({ dias, hoy: fechaLima(0) });
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }

    if (p === '/api/comparar') {
      const fecha = url.searchParams.get('fecha') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'fecha inválida' }, 400);
      const d = await comparar(env, fecha);
      return d ? json(d) : json({ error: 'sin datos' }, 404);
    }

    if (p === '/api/estado-robot') {
      return json((await env.DATOS.get('ultimo', 'json')) || {});
    }

    // El robot sube aquí los precios que leyó del SISAP: desde la propia página del SISAP
    // en Chrome (se reconoce por su origen) o desde una computadora con la clave.
    if ((p === '/api/subir' || p === '/api/dias') && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (p === '/api/subir' && request.method === 'POST') {
      const res = await subir(request, url, env, origen === ORIGEN_SISAP);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }


    // Sala compartida del visualizador.
    if (p === '/api/sala') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se espera un websocket', { status: 426 });
      const id = env.SALA.idFromName('principal');
      return env.SALA.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(correrRobot(env));
  }
};

// Guarda lo que se ve en el visualizador y lo reparte a todas las pantallas abiertas.
export class Sala {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.state.acceptWebSocket(servidor);
    const actual = (await this.state.storage.get('estado')) || null;
    servidor.send(JSON.stringify({ tipo: 'estado', estado: actual }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, mensaje) {
    let m;
    try { m = JSON.parse(mensaje); } catch { return; }
    if (m.tipo !== 'estado' || typeof m.estado !== 'object' || !m.estado) return;
    const e = m.estado;
    const limpio = {
      sel: typeof e.sel === 'string' ? e.sel.slice(0, 20) : '',
      fecha: typeof e.fecha === 'string' ? e.fecha.slice(0, 10) : '',
      filtro: ['todos', 'sube', 'baja', 'igual'].includes(e.filtro) ? e.filtro : 'todos',
      pag: Number.isInteger(e.pag) && e.pag >= 0 && e.pag < 100 ? e.pag : 0,
      orden: e.orden === 'asc' ? 'asc' : 'desc'
    };
    await this.state.storage.put('estado', limpio);
    const txt = JSON.stringify({ tipo: 'estado', estado: limpio });
    for (const otro of this.state.getWebSockets()) {
      if (otro !== ws) { try { otro.send(txt); } catch {} }
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'cerrado'); } catch {}
  }
}

// El robot. Con «fecha» arma el día completo; con «fecha» y «region» consulta una sola ciudad.
// Cada parte corre aparte, para no pasar los límites del plan gratuito.
export class Robot {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const q = new URL(request.url).searchParams;
    const fecha = q.get('fecha') || '';
    const region = q.get('region') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'fecha inválida' }, 400);

    if (region) {
      if (!/^\d{6}$/.test(region)) return json({ error: 'región inválida' }, 400);
      const filas = await consultarRegion(this.env.SISAP_URL || SISAP_BASE, region, fecha);
      return json({ filas });
    }

    const ult = (await this.state.storage.get('ultimo')) || 0;
    if (Date.now() - ult < 9 * 60e3) return json({ fecha, omitido: 'consultado hace menos de 10 minutos' });
    await this.state.storage.put('ultimo', Date.now());
    const env = this.env;
    const consultar = async cod => {
      const r = await env.ROBOT.get(env.ROBOT.idFromName('c:' + fecha + ':' + cod))
        .fetch('https://robot/?fecha=' + fecha + '&region=' + cod);
      if (!r.ok) throw new Error('falló ' + cod);
      return (await r.json()).filas;
    };
    return json(await actualizarDia(env, fecha, consultar));
  }
}
