/*
 * Calendario de /category/eventos/. Lee las fechas de la lista (data-inicio / data-fin),
 * abre en el mes actual, marca los días con eventos y muestra solo los eventos del mes.
 * Al pulsar un día se filtra la lista; "Ver todo el mes" vuelve a mostrarlos todos.
 * Las tarjetas de entradas de la página (data-inicio / data-fin, src/lib/agenda.ts) siguen el
 * mismo filtro: solo se ven las del mes (o día) elegido en el calendario.
 */
(function () {
  var root = document.querySelector('.fem-agenda');
  if (!root) return;
  var cal = root.querySelector('.fem-agenda__cal');
  var tbody = root.querySelector('.fem-agenda__grid tbody');
  var mesEl = root.querySelector('.fem-agenda__mes');
  var sub = root.querySelector('.fem-agenda__subtitulo');
  var todo = root.querySelector('.fem-agenda__todo');
  var vacio = root.querySelector('.fem-agenda__vacio');
  var items = Array.prototype.slice.call(root.querySelectorAll('.fem-agenda__evento'));
  var tarjetas = Array.prototype.slice.call(document.querySelectorAll('article[data-inicio]'));
  var sinEntradas = document.querySelector('.fem-agenda__sin-entradas');
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  var now = new Date();
  var hoy = iso(now.getFullYear(), now.getMonth(), now.getDate());
  var y = now.getFullYear(), m = now.getMonth(), dia = null;

  items.forEach(function (li) {
    if (li.dataset.fin < hoy) {
      li.classList.add('is-pasado');
      var meta = li.querySelector('.fem-agenda__meta');
      if (meta) meta.insertAdjacentHTML('afterbegin', '<span class="fem-agenda__estado">Finalizado</span> ');
    }
  });

  function eventosEn(d) { return items.filter(function (li) { return li.dataset.inicio <= d && li.dataset.fin >= d; }); }

  function pintar() {
    var primero = new Date(y, m, 1);
    var dias = new Date(y, m + 1, 0).getDate();
    var desfase = (primero.getDay() + 6) % 7; // lunes = 0
    var desde = iso(y, m, 1), hasta = iso(y, m, dias);
    mesEl.textContent = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' ' + y;

    var html = '', celda = 0;
    for (var f = 0; celda < desfase + dias; f++) {
      html += '<tr>';
      for (var c = 0; c < 7; c++, celda++) {
        var n = celda - desfase + 1;
        if (n < 1 || n > dias) { html += '<td></td>'; continue; }
        var d = iso(y, m, n), evs = eventosEn(d), cls = [];
        if (d === hoy) cls.push('is-hoy');
        if (evs.length) {
          cls.push('has-evento');
          if (d === dia) cls.push('is-sel');
          var nombres = evs.map(function (li) { return li.querySelector('.fem-agenda__titulo').textContent; }).join('; ');
          html += '<td class="' + cls.join(' ') + '"><button type="button" data-dia="' + d + '" aria-pressed="' + (d === dia) +
            '" aria-label="' + n + ' de ' + MESES[m] + ': ' + nombres.replace(/"/g, '&quot;') + '">' + n +
            '<span class="fem-agenda__n" aria-hidden="true">' + (evs.length > 1 ? evs.length : '') + '</span></button></td>';
        } else {
          html += '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><span>' + n + '</span></td>';
        }
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;

    var visibles = 0;
    items.forEach(function (li) {
      var ok = dia ? (li.dataset.inicio <= dia && li.dataset.fin >= dia)
                   : (li.dataset.inicio <= hasta && li.dataset.fin >= desde);
      li.hidden = !ok;
      if (ok) visibles++;
    });
    var tVisibles = 0;
    tarjetas.forEach(function (a) {
      var ok = dia ? (a.dataset.inicio <= dia && a.dataset.fin >= dia)
                   : (a.dataset.inicio <= hasta && a.dataset.fin >= desde);
      a.hidden = !ok;
      if (ok) tVisibles++;
    });
    if (sinEntradas) sinEntradas.hidden = tVisibles > 0;
    sub.textContent = dia ? 'Eventos del ' + Number(dia.slice(8)) + ' de ' + MESES[m]
                          : 'Eventos de ' + MESES[m] + ' de ' + y;
    todo.hidden = !dia;
    vacio.hidden = visibles > 0;
  }

  root.addEventListener('click', function (e) {
    var nav = e.target.closest('.fem-agenda__nav');
    if (nav) {
      m += Number(nav.dataset.dir);
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      dia = null; pintar(); return;
    }
    var b = e.target.closest('button[data-dia]');
    if (b) { dia = dia === b.dataset.dia ? null : b.dataset.dia; pintar(); root.querySelector('[data-dia="' + (dia || b.dataset.dia) + '"]').focus(); return; }
    if (e.target === todo) { dia = null; pintar(); }
  });

  cal.hidden = false;
  root.classList.add('is-js');
  pintar();
})();
