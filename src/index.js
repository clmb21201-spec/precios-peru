import { correrRobot, fechaLima, actualizarDia, comparar } from './sisap.js';

const JSON_H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_H });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';

    // Las dos páginas: el visualizador (sincronizado) y el lector (independiente).
    if (p === '/' || p === '/lector') {
      return env.ASSETS.fetch(new Request(new URL('/', url), request));
    }

    if (p === '/api/dias') {
      const dias = (await env.DATOS.get('dias', 'json')) || [];
      return json({ dias, hoy: fechaLima(0) });
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

    // Para la primera carga o una revisión manual. Como máximo una vez cada 10 minutos.
    if (p === '/api/actualizar') {
      const ult = await env.DATOS.get('ultimo', 'json');
      if (ult && Date.now() - Date.parse(ult.cuando) < 10 * 60e3) {
        return json({ mensaje: 'El robot ya corrió hace menos de 10 minutos.', ultimo: ult });
      }
      await env.DATOS.put('ultimo', JSON.stringify({ cuando: new Date().toISOString(), resultados: 'en curso' }));
      ctx.waitUntil(correrRobot(env));
      return json({ mensaje: 'Robot en marcha. Los precios aparecerán en uno o dos minutos.' });
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

// Consulta un solo día del SISAP. Cloudflare lo corre aparte de quien lo llama.
export class Robot {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const fecha = new URL(request.url).searchParams.get('fecha') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'fecha inválida' }, 400);
    const ult = (await this.state.storage.get('ultimo')) || 0;
    if (Date.now() - ult < 9 * 60e3) return json({ fecha, omitido: 'consultado hace menos de 10 minutos' });
    await this.state.storage.put('ultimo', Date.now());
    return json(await actualizarDia(this.env, fecha));
  }
}
