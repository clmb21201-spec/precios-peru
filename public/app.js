(function () {
  'use strict';

  var LECTOR = /^\/lector\/?$/.test(location.pathname);
  var POR_PAG = 6;
  var CIUDADES = window.CIUDADES; // [clave, region, ciudad, x%, y%]
  var POR_CLAVE = {};
  CIUDADES.forEach(function (c) { POR_CLAVE[c[0]] = c; });

  // ---------- Dibujos ----------
  var KW = [
    ['papaya', 'papaya'], ['aceituna', 'aceituna'], ['aceite', 'aceite'], ['arroz', 'arroz'], ['arveja', 'arveja'],
    ['azucar', 'azucar'], ['camote', 'camote'], ['cebolla', 'cebolla'], ['cereza', 'cerezas'], ['chirimoya', 'chirimoya'],
    ['choclo', 'choclo'], ['fideo', 'fideos'], ['fresa', 'fresa'], ['garbanzo', 'garbanzo'], ['granadilla', 'granadilla'],
    ['haba', 'haba'], ['harina', 'harina'], ['huevo', 'huevos'], ['leche', 'leche'], ['lenteja', 'lenteja'], ['limon', 'limon'],
    ['mandarina', 'mandarina'], ['mango', 'mango'], ['manzana', 'manzana'], ['melocoton', 'melocoton'], ['durazno', 'melocoton'],
    ['melon', 'melon'], ['naranja', 'naranja'], ['olluco', 'olluco'], ['pallar', 'pallar'], ['palta', 'palta'], ['papa', 'papa'],
    ['pera', 'pera'], ['pescado', 'pescado'], ['bonito', 'pescado'], ['jurel', 'pescado'], ['caballa', 'pescado'], ['pina', 'pina'],
    ['platano', 'platano'], ['pollo', 'pollo'], ['gallo', 'pollo'], ['gallina', 'pollo'], ['porcino', 'cerdo'], ['cerdo', 'cerdo'],
    ['vacuno', 'res'], ['res', 'res'], ['oveja', 'oveja'], ['carnero', 'oveja'], ['carne', 'res'], ['quinua', 'quinua'],
    ['sandia', 'sandia'], ['tarhui', 'tarhui'], ['chocho', 'tarhui'], ['tomate', 'tomate'], ['uva', 'uva'], ['vainita', 'vainita'],
    ['yuca', 'yuca'], ['zanahoria', 'zanahoria'], ['zapallo', 'zapallo'], ['ajo', 'ajo'], ['kion', 'kion']
  ];
  function sinTilde(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function icono(nombre) {
    var t = sinTilde(nombre);
    if (/\baji\b/.test(t)) return '/iconos/' + (/seco|panca|paprika|mirasol/.test(t) ? 'ajiseco' : 'ajifresco') + '.svg';
    if (/\bfrijol\b/.test(t)) return '/iconos/' + (/verde/.test(t) ? 'frijolverde' : 'frijolseco') + '.svg';
    for (var i = 0; i < KW.length; i++) {
      if (new RegExp('\\b' + KW[i][0]).test(t)) return '/iconos/' + KW[i][1] + '.svg';
    }
    return '/iconos/canasta.svg';
  }
  function porUnidad(u) {
    var t = sinTilde(u || '');
    if (!t || t === 'kilogramo') return '';
    return 'por ' + t;
  }

  // ---------- Fechas ----------
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fd(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function largo(iso) { var d = fd(iso); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; }
  function corto(iso) { var d = fd(iso); return DIAS[d.getUTCDay()].slice(0, 3) + ' ' + d.getUTCDate() + ' ' + MES3[d.getUTCMonth()]; }
  function menosUno(iso) { var d = fd(iso); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

  // ---------- Estado ----------
  var estado = { sel: '', fecha: '', filtro: 'todos', pag: 0, orden: 'desc' };
  var dias = [], hoy = '', datos = {}, cargando = {};

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dinero(d) { var c = Math.round(Math.abs(d) * 100); return c < 100 ? c + ' cént.' : 'S/ ' + (c / 100).toFixed(2); }

  function cambiar(parcial, desdeSala) {
    for (var k in parcial) estado[k] = parcial[k];
    if (estado.fecha && !datos[estado.fecha]) cargarDia(estado.fecha);
    pintar();
    if (!LECTOR && !desdeSala) enviarSala();
  }

  // ---------- Datos ----------
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; });
  }
  function cargarDias() {
    return getJSON('/api/dias').then(function (r) {
      if (!r) return;
      dias = r.dias || []; hoy = r.hoy || '';
      if (!estado.fecha || dias.indexOf(estado.fecha) === -1) estado.fecha = dias[dias.length - 1] || '';
      if (estado.fecha) return cargarDia(estado.fecha, true);
    });
  }
  function cargarDia(fecha, forzar) {
    if (cargando[fecha] && !forzar) return cargando[fecha];
    cargando[fecha] = getJSON('/api/comparar?fecha=' + fecha).then(function (r) {
      if (r) datos[fecha] = r;
      pintar();
    });
    return cargando[fecha];
  }

  // ---------- Filas de una ciudad ----------
  function filas(c) {
    var d = datos[estado.fecha];
    if (!d || !d.ciudades[c]) return null;
    var hoyL = d.ciudades[c].hoy || [], antes = d.ciudades[c].antes;
    var mapa = {};
    hoyL.forEach(function (p) { mapa[p[0]] = { nombre: p[0], unidad: p[1], ahora: p[2], antes: null }; });
    if (antes) antes.productos.forEach(function (p) {
      if (!mapa[p[0]]) mapa[p[0]] = { nombre: p[0], unidad: p[1], ahora: null, antes: p[2] };
      else { mapa[p[0]].antes = p[2]; if (!mapa[p[0]].unidad) mapa[p[0]].unidad = p[1]; }
    });
    var lista = [];
    Object.keys(mapa).forEach(function (k) {
      var it = mapa[k];
      // Sin precio de hoy, el producto no se muestra.
      if (it.ahora === null) return;
      if (it.antes === null) { it.dir = 'nodato'; it.d = 0; }
      else { it.d = it.ahora - it.antes; it.dir = Math.abs(it.d) < 0.005 ? 'igual' : (it.d > 0 ? 'sube' : 'baja'); }
      lista.push(it);
    });
    return { lista: lista, antesFecha: antes ? antes.fecha : null };
  }

  // ---------- Pintar ----------
  var mapaEl = document.getElementById('mapa');
  var panel = document.getElementById('panel');
  var selectEl = document.getElementById('region');

  CIUDADES.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c[0]; o.textContent = c[1] + ' (' + c[2] + ')';
    selectEl.appendChild(o);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'punto'; b.dataset.c = c[0];
    b.style.left = c[3] + '%'; b.style.top = c[4] + '%';
    b.setAttribute('aria-label', 'Ver precios de ' + c[2] + ' (' + c[1] + ')');
    b.innerHTML = '<span class="dot"></span><span class="etq">' + esc(c[2]) + '</span>';
    b.addEventListener('click', function () { cambiar({ sel: c[0], pag: 0, filtro: 'todos' }); });
    mapaEl.appendChild(b);
  });
  selectEl.addEventListener('change', function () { cambiar({ sel: selectEl.value, pag: 0, filtro: 'todos' }); });

  var FLECHA_I = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3l-7 7 7 7"/></svg>';
  var FLECHA_D = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3l7 7-7 7"/></svg>';
  var CERRAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 3l12 12M15 3L3 15"/></svg>';
  var ABAJO = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M3 9l5 5 5-5"/></svg>';
  var ARRIBA = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V2M3 7l5-5 5 5"/></svg>';

  function pintar() {
    var d = datos[estado.fecha];
    var conDatos = d ? Object.keys(d.ciudades).filter(function (k) { return d.ciudades[k].hoy && d.ciudades[k].hoy.some(function (p) { return p[2] !== null; }); }) : [];
    // Puntos
    Array.prototype.forEach.call(mapaEl.querySelectorAll('.punto'), function (b) {
      var c = b.dataset.c;
      b.classList.toggle('activo', c === estado.sel);
      b.classList.toggle('sindatos', !!d && conDatos.indexOf(c) === -1);
      if (c === estado.sel) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
    });
    selectEl.value = estado.sel || '';

    var pie = document.getElementById('pie');
    if (d && d.actualizado) {
      var t = new Date(d.actualizado);
      pie.textContent = 'Precios en soles, promedio de los mercados minoristas de cada ciudad. Última revisión del robot: ' +
        t.toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).replace(/\.$/, '') + '.';
    }

    if (!dias.length) {
      panel.innerHTML = vacio('Aún no hay precios guardados', 'El robot consulta el SISAP a las 9:00, 11:00, 12:00 y 15:00. Los precios aparecerán después de su primera revisión.', '');
      return;
    }
    if (!estado.sel || !POR_CLAVE[estado.sel]) {
      panel.innerHTML = vacio('Elige una ciudad', 'Cada punto es una ciudad con mercados minoristas. Al tocarla verás cuánto costaba cada producto y cuánto cuesta ahora.',
        d ? conDatos.length + ' ciudades con precios el ' + largo(estado.fecha) : 'Cargando…');
      return;
    }
    var c = POR_CLAVE[estado.sel];
    var idx = dias.indexOf(estado.fecha);
    var esHoy = estado.fecha === hoy;
    var html = '<div class="panel-cab"><div><p class="region">' + esc(c[1]) + '</p><h2 class="ciudad">' + esc(c[2]) + '</h2></div>' +
      '<button type="button" class="redondo" data-acc="cerrar" aria-label="Cerrar y volver al mapa">' + CERRAR + '</button></div>' +
      '<div class="dia"><button type="button" data-acc="diaAnt" aria-label="Día anterior"' + (idx <= 0 ? ' disabled' : '') + '>' + FLECHA_I + '</button>' +
      '<p>' + (esHoy ? 'Hoy, ' : '') + largo(estado.fecha) + '</p>' +
      '<button type="button" data-acc="diaSig" aria-label="Día siguiente"' + (idx >= dias.length - 1 ? ' disabled' : '') + '>' + FLECHA_D + '</button></div>';

    var f = d ? filas(estado.sel) : null;
    if (!d) {
      panel.innerHTML = html + vacioCorto('Cargando precios…');
      return;
    }
    if (!f || !f.lista.length) {
      panel.innerHTML = html + vacioCorto(c[2] + ' no reportó precios minoristas este día. Prueba con otra fecha.');
      return;
    }
    var cuenta = { todos: f.lista.length, sube: 0, baja: 0, igual: 0, nodato: 0 };
    f.lista.forEach(function (it) { cuenta[it.dir]++; });
    var items = f.lista.filter(function (it) { return estado.filtro === 'todos' || it.dir === estado.filtro; });
    items.sort(function (a, b) {
      if (a.dir === 'nodato' && b.dir !== 'nodato') return 1;
      if (b.dir === 'nodato' && a.dir !== 'nodato') return -1;
      var x = Math.abs(a.d), y = Math.abs(b.d);
      if (x === y) return a.nombre.localeCompare(b.nombre, 'es');
      return estado.orden === 'desc' ? y - x : x - y;
    });
    var nPag = Math.max(1, Math.ceil(items.length / POR_PAG));
    var pag = Math.min(estado.pag, nPag - 1);
    var desde = pag * POR_PAG;
    var pagina = items.slice(desde, desde + POR_PAG);

    var antesLabel = f.antesFecha ? ((esHoy && f.antesFecha === menosUno(estado.fecha)) ? 'Ayer' : corto(f.antesFecha)) : 'Antes';
    var hoyLabel = esHoy ? 'Hoy' : corto(estado.fecha);

    html += '<div class="controles"><div class="filtros" role="group" aria-label="Filtrar">' +
      [['todos', 'Todo'], ['sube', 'Subió'], ['baja', 'Bajó'], ['igual', 'Igual']].map(function (x) {
        var on = estado.filtro === x[0];
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-filtro="' + x[0] + '">' + x[1] + ' (' + cuenta[x[0]] + ')</button>';
      }).join('') + '</div>' +
      '<button type="button" class="orden" data-acc="orden" aria-label="Cambiar el orden por cuánto cambió el precio">' +
      (estado.orden === 'desc' ? ABAJO + '<span>Mayor a menor</span>' : ARRIBA + '<span>Menor a mayor</span>') + '</button></div>';

    html += '<div class="lista"><div class="fila cab"><span></span><span>Producto</span><span>' + esc(antesLabel) + '</span><span>' + esc(hoyLabel) + '</span></div>';
    if (!pagina.length) html += '<p class="sinfilas">No hay productos en este grupo.</p>';
    pagina.forEach(function (it) {
      var u = porUnidad(it.unidad);
      var linea = it.dir === 'sube' ? '<span class="cambio sube">▲ sube ' + dinero(it.d) + '</span>' :
        it.dir === 'baja' ? '<span class="cambio baja">▼ baja ' + dinero(it.d) + '</span>' :
        it.dir === 'igual' ? '<span class="cambio">= igualito</span>' : '';
      if (u) linea = linea ? linea.replace('</span>', ' · ' + u + '</span>') : '<span class="cambio">' + u + '</span>';
      html += '<div class="fila"><img src="' + icono(it.nombre) + '" alt="" width="46" height="46">' +
        '<div class="nombre"><b>' + esc(it.nombre) + '</b>' + linea + '</div>' +
        '<span class="antes">' + (it.antes === null ? '<span class="nohay">No hay Precio</span>' : '<small>S/ </small>' + it.antes.toFixed(2)) + '</span>' +
        '<span class="ahora">' + (it.ahora === null ? '<span class="nohay">No hay Precio</span>' : '<small>S/ </small>' + it.ahora.toFixed(2)) + '</span></div>';
    });
    html += '</div>';
    html += '<div class="paginas"><button type="button" class="btn" data-acc="pagAnt"' + (pag === 0 ? ' disabled' : '') + '>' + FLECHA_I.replace('width="20" height="20"', 'width="16" height="16"') + 'Anteriores</button>' +
      '<p>' + (desde + 1) + '–' + (desde + pagina.length) + ' de ' + items.length + '</p>' +
      '<button type="button" class="btn amarillo" data-acc="pagSig"' + (pag >= nPag - 1 ? ' disabled' : '') + '>Siguientes' + FLECHA_D.replace('width="20" height="20"', 'width="16" height="16"') + '</button></div>';
    panel.innerHTML = html;
  }

  function vacio(t1, t2, t3) {
    return '<div class="vacio"><svg aria-hidden="true" width="120" height="70" viewBox="0 0 120 70" fill="none" stroke="#F5D76E" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M112 14C80 6 40 14 18 46"/><path d="M14 30l3 18 17-5"/></svg>' +
      '<p class="grande">' + esc(t1) + '</p><p class="texto">' + esc(t2) + '</p>' + (t3 ? '<p class="dato">' + esc(t3) + '</p>' : '') + '</div>';
  }
  function vacioCorto(t) {
    return '<div class="vacio" style="height:auto;min-height:560px"><p class="texto">' + esc(t) + '</p></div>';
  }

  panel.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.filtro) return cambiar({ filtro: b.dataset.filtro, pag: 0 });
    var idx = dias.indexOf(estado.fecha);
    switch (b.dataset.acc) {
      case 'cerrar': return cambiar({ sel: '' });
      case 'diaAnt': if (idx > 0) cambiar({ fecha: dias[idx - 1], pag: 0 }); return;
      case 'diaSig': if (idx < dias.length - 1) cambiar({ fecha: dias[idx + 1], pag: 0 }); return;
      case 'orden': return cambiar({ orden: estado.orden === 'desc' ? 'asc' : 'desc', pag: 0 });
      case 'pagAnt': return cambiar({ pag: Math.max(0, estado.pag - 1) });
      case 'pagSig': return cambiar({ pag: estado.pag + 1 });
    }
  });

  // ---------- Sala compartida (visualizador) ----------
  var ws = null, reintento = 1000;
  function modo(texto, vivo) {
    document.getElementById('modo-texto').textContent = texto;
    document.getElementById('modo').classList.toggle('vivo', !!vivo);
  }
  function conectar() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/api/sala');
    ws.onopen = function () { reintento = 1000; modo('Visualizador · en vivo', true); };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.tipo === 'estado' && m.estado) {
        var e = m.estado;
        cambiar({ sel: e.sel || '', fecha: (e.fecha && dias.indexOf(e.fecha) !== -1) ? e.fecha : estado.fecha, filtro: e.filtro || 'todos', pag: e.pag || 0, orden: e.orden || 'desc' }, true);
      }
    };
    ws.onclose = function () {
      modo('Visualizador · reconectando…', false);
      setTimeout(conectar, reintento);
      reintento = Math.min(reintento * 2, 15000);
    };
  }
  function enviarSala() {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ tipo: 'estado', estado: estado }));
  }

  // ---------- Arranque ----------
  if (LECTOR) modo('Modo lector', false); else modo('Visualizador · conectando…', false);
  cargarDias().then(function () {
    pintar();
    if (!LECTOR) conectar();
  });
  // Cada 10 minutos revisa si el robot trajo precios nuevos.
  setInterval(function () {
    var ultimo = dias[dias.length - 1];
    getJSON('/api/dias').then(function (r) {
      if (!r) return;
      var seguir = estado.fecha === ultimo;
      dias = r.dias || []; hoy = r.hoy || hoy;
      if (seguir && dias.length) estado.fecha = dias[dias.length - 1];
      if (estado.fecha) cargarDia(estado.fecha, true);
    });
  }, 10 * 60e3);
})();
