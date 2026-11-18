// Robot de precios para correr DENTRO de la página del SISAP (http://sistemas.midagri.gob.pe/sisap/portal2/ciudades/),
// en un navegador en el Perú. Lee el precio minorista promedio de las 28 ciudades y lo sube a la web.
// Uso: en la consola de esa página, cargar este archivo y ejecutar. El avance queda en window.__robot.
(function () {
  var WEB = 'https://precios-peru.ecproyectos.workers.dev';
  var REGIONES = [['010000','amazonas'],['020000','ancash'],['030000','apurimac'],['030201','andahuaylas'],['040000','arequipa'],
    ['050000','ayacucho'],['060000','cajamarca'],['060401','chota'],['060801','jaen'],['070000','callao'],['080000','cusco'],
    ['090000','huancavelica'],['100000','huanuco'],['110000','ica'],['120000','junin'],['130000','lalibertad'],['140000','lambayeque'],
    ['150000','lima'],['160000','loreto'],['170000','madrededios'],['180000','moquegua'],['190000','pasco'],['200000','piura'],
    ['210000','puno'],['220000','sanmartin'],['230000','tacna'],['240000','tumbes'],['250000','ucayali']];
  var PRODUCTOS = ('1001 1018 0202 0203 0204 0401 0301 1005 0101 1101 0212 0641 0603 0403 1010 0607 0501 0302 1305 0502 0608 ' +
    '0303 1011 1105 1104 0504 0611 0614 0615 0617 0620 0619 0622 0102 0506 0626 0104 0627 0631 1201 0628 0629 0405 0633 0306 ' +
    '0228 0637 0229 0105 0230 0231').split(' ');
  var R = window.__robot = { estado: 'en curso', inicio: new Date().toISOString(), resumen: [], errores: [] };

  function limpiar(t) {
    var d = document.createElement('textarea');
    d.innerHTML = t.replace(/<[^>]*>/g, '');
    return d.value.replace(/\s+/g, ' ').trim();
  }
  function leerTabla(html) {
    var out = [], re = /<tr[^>]*class=["']?contenido["']?[^>]*>([\s\S]*?)<\/tr>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var c = m[1].split(/<td[^>]*>/i).slice(1).map(limpiar);
      if (c.length < 4 || !c[0]) continue;
      var n = parseFloat(c[3].replace(',', '.'));
      out.push([c[0], c[1] || '', isFinite(n) ? n : null]);
    }
    return out.length ? out : null;
  }
  function fechaLima(k) { return new Date(Date.now() - 5 * 3600e3 + k * 86400e3).toISOString().slice(0, 10); }
  function url(cod, iso) {
    var p = iso.split('-');
    return '/sisap/portal2/ciudades/resumenes/filtrar?region=' + cod + '&variables[]=min_precio_prom&fecha=' + p[2] + '/' + p[1] + '/' + p[0] +
      '&' + PRODUCTOS.map(function (c) { return 'productos[]=' + c; }).join('&') + '&periodicidad=dia&__ajax_carga_final=consulta&ajax=true';
  }
  async function ciudad(cod, iso) {
    var r = await fetch(url(cod, iso), { credentials: 'omit', cache: 'no-store' });
    if (!r.ok) throw new Error('SISAP ' + r.status);
    return leerTabla(new TextDecoder('windows-1252').decode(new Uint8Array(await r.arrayBuffer())));
  }
  async function dia(iso) {
    var ciudades = {}, con = 0, sin = 0, fallos = 0;
    for (var k = 0; k < REGIONES.length; k += 4) {
      var lote = REGIONES.slice(k, k + 4);
      var res = await Promise.allSettled(lote.map(function (x) { return ciudad(x[0], iso); }));
      res.forEach(function (r, j) {
        if (r.status === 'fulfilled') { if (r.value) { ciudades[lote[j][1]] = r.value; con++; } else sin++; }
        else { fallos++; R.errores.push(iso + ' ' + lote[j][1] + ': ' + r.reason); }
      });
    }
    var linea = { fecha: iso, conPrecios: con, sinDatos: sin, fallos: fallos };
    if (con) {
      var s = await fetch(WEB + '/api/subir?fecha=' + iso, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ciudades: ciudades }) });
      linea.web = s.status + ' ' + (await s.text()).slice(0, 200);
    }
    R.resumen.push(linea);
  }
  R.promesa = (async function () {
    try {
      var hoy = fechaLima(0);
      await dia(hoy);
      // Días anteriores que le faltan a la web (hasta 7), una vez al día.
      if (localStorage.getItem('precios_atrasados') !== hoy) {
        var g = await (await fetch(WEB + '/api/dias', { cache: 'no-store' })).json();
        for (var k = 1; k <= 7; k++) {
          var f = fechaLima(-k);
          if ((g.dias || []).indexOf(f) === -1) await dia(f);
        }
        localStorage.setItem('precios_atrasados', hoy);
      }
      R.estado = 'listo';
    } catch (e) {
      R.estado = 'error'; R.errores.push(String(e));
    }
    R.fin = new Date().toISOString();
  })();
})();
