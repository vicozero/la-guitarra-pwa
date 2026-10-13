/* CatalogMigration.reconcile: mantiene el catálogo seleccionado y las capturas identificables. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;

  function value(item, key) {
    var v = item == null ? null : item[key];
    return v == null ? '' : String(v);
  }

  /* Carga el catálogo base incluido en el PWA (assets/equipos.json). */
  function load() {
    return fetch('data/equipos.json').then(function (r) {
      if (!r.ok) throw new Error('cat\u00e1logo');
      return r.json();
    });
  }

  function reconcile(catalog, previous) {
    var result = [];
    var used = {};
    for (var s = 0; s < catalog.length; s++) {
      var source = catalog[s];
      var match = -1;
      for (var i = 0; i < previous.length; i++) {
        if (used[i]) continue;
        var id = U.safe(previous[i].id);
        if (id === U.safe(source.id) || (U.safe(source.legacyId) !== '' && id === U.safe(source.legacyId))) { match = i; break; }
      }
      if (match < 0) {
        var candidate = -1, count = 0;
        for (var j = 0; j < previous.length; j++) {
          if (used[j]) continue;
          var old = previous[j];
          if (U.normal(old.equipo) === U.normal(source.equipo) && U.safe(old.eco) === U.safe(source.eco)) { candidate = j; count++; }
        }
        if (count === 1) match = candidate;
      }
      var item = Object.assign({}, source);
      if (match >= 0) { Object.assign(item, previous[match]); used[match] = true; }
      ['id', 'equipo', 'eco', 'marca', 'familia', 'fuente', 'kpi'].forEach(function (key) { item[key] = source[key]; });
      delete item.legacyId;
      result.push(item);
    }
    return result;
  }

  LG.catalog = { load: load, reconcile: reconcile };
})();
