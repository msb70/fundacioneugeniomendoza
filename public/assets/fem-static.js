/*
 * Complementos del sitio estático (no existían en WordPress porque allí los resolvía PHP):
 *  - Aviso tras enviar el formulario de contacto o un comentario.
 *  - Refresco de las valoraciones con estrellas (el HTML trae el valor del build).
 */
(function () {
  var q = new URLSearchParams(location.search);
  var msgs = {
    contacto: {
      ok: '¡Gracias! Tu mensaje fue enviado. Te responderemos pronto.',
      error: 'No pudimos enviar tu mensaje. Revisa los datos e inténtalo de nuevo.',
      limite: 'Has enviado demasiados mensajes. Inténtalo más tarde.'
    },
    comentario: {
      pendiente: 'Gracias. Tu comentario está pendiente de moderación.',
      error: 'No pudimos enviar tu comentario. Revisa los datos e inténtalo de nuevo.',
      limite: 'Has enviado demasiados comentarios. Inténtalo más tarde.'
    }
  };
  Object.keys(msgs).forEach(function (k) {
    var v = q.get(k);
    if (v && msgs[k][v]) {
      window.addEventListener('load', function () {
        alert(msgs[k][v]);
        q.delete(k);
        var s = q.toString();
        history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
      });
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var boxes = document.querySelectorAll('.fem-rating-box[data-post-id]');
    if (!boxes.length || !window.fetch) return;
    var ids = Array.prototype.map.call(boxes, function (b) { return b.dataset.postId; });
    fetch('/api/rating.php?ids=' + ids.join(','), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success) return;
        boxes.forEach(function (b) {
          var d = res.data[b.dataset.postId];
          if (!d) return;
          var avg = b.querySelector('.fem-rating-average');
          var cnt = b.querySelector('.fem-rating-count');
          if (avg) avg.textContent = Number(d.average).toFixed(1);
          if (cnt) cnt.textContent = d.count;
        });
      })
      .catch(function () {});
  });
})();
