/* Reports: exportación CSV (idéntica al APK), libro Excel y utilidades de
   descarga / compartir para el reporte PDF y PNG. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;
  var X = LG.xlsx;

  var CSV_KEYS = ['equipo', 'eco', 'marca', 'familia', 'departamento', 'ubicacion', 'estado',
    'programadas', 'inicio', 'final', 'mp', 'mc', 'percInicio', 'percFinal', 'hidraulico',
    'motor', 'transmision', 'dieselEquipo', 'personal', 'observaciones', 'capturadoPor'];

  var R = (LG.reports = {});

  function safe(v) { return v == null ? '' : String(v); }

  /* Suma las mismas columnas que MainActivity.totals. */
  function totals(records, family) {
    var t = [0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < records.length; i++) {
      var o = records[i] || {};
      if (family != null && safe(o.familia) !== family) continue;
      if (o.kpi === false) continue;
      t[6]++;
      var k = LG.kpi.calc(o);
      if (k.completo) { t[0] += k.periodo; t[1] += k.trabajo; t[2] += k.mp; t[3] += k.mc; t[4] += k.espera; t[5]++; }
      else t[7]++;
    }
    return t;
  }
  R.totals = totals;

  /* ---- CSV (puerto exacto de OperationsUI.csv) ---- */
  R.csvText = function (records, meta) {
    meta = meta || {};
    var out = '\ufeffFecha,Turno,Supervisor,KPI';
    for (var i = 0; i < CSV_KEYS.length; i++) out += ',' + LG.csv.cell(CSV_KEYS[i]);
    out += ',Trabajo_h,Disponible_h,Espera_h,Disponibilidad_pct,Utilizacion_pct\r\n';
    for (var j = 0; j < records.length; j++) {
      var o = records[j] || {};
      out += LG.csv.cell(meta.fecha) + ',' + LG.csv.cell(meta.turno || 'D\u00eda') + ',' + LG.csv.cell(meta.supervisor || '') + ',' + (o.kpi !== false);
      for (var k = 0; k < CSV_KEYS.length; k++) out += ',' + LG.csv.cell(o[CSV_KEYS[k]]);
      var m = LG.kpi.calc(o);
      var has = o.kpi !== false;
      var values = [m.trabajo, m.disponible, m.espera, m.disponibilidad * 100, m.utilizacion * 100];
      for (var v = 0; v < values.length; v++) out += ',' + (has && U.finite(values[v]) ? values[v].toFixed(4) : '');
      out += '\r\n';
    }
    return out;
  };

  /* ---- Libro Excel (extra sobre el APK: CSV + libro con varias hojas) ---- */
  R.xlsxBytes = function (records, meta, tables) {
    meta = meta || {};
    tables = tables || {};
    var sheets = [];
    var t = totals(records, null);

    var turn = new X.Sheet('Datos del turno').cols([34, 54]);
    turn.row([X.text('Datos del turno', X.S_TITLE)]);
    var lines = [
      ['Fecha', meta.fecha], ['Turno', meta.turno || 'D\u00eda'], ['Supervisor', meta.supervisor || ''],
      ['Di\u00e9sel total cargado', meta.diesel || ''], ['Equipos', String(records.length)],
      ['Capturas KPI completas', String(t[5] | 0)], ['Pendientes KPI', String(t[7] | 0)]
    ];
    for (var i = 0; i < lines.length; i++) turn.row([X.text(lines[i][0], X.S_LABEL), X.text(lines[i][1], X.S_CELL)]);
    sheets.push(turn);

    var head = ['Equipo', 'Eco', 'Marca', 'Familia', 'Departamento', 'Ubicaci\u00f3n', 'Estado', 'KPI',
      'Programadas', 'Inicio', 'Final', 'MP', 'MC', 'Trabajo_h', 'Disponible_h', 'Espera_h',
      'Disponibilidad_pct', 'Utilizacion_pct'];
    for (var c = 0; c < CSV_KEYS.length; c++) head.push(CSV_KEYS[c]);
    var cap = new X.Sheet('Captura').cols([30, 8, 14, 20, 18, 18, 16, 8, 12, 12, 12, 10, 10, 12, 12, 12, 14, 14, 14, 14, 14, 14, 14, 26, 22, 24, 20, 14, 24]);
    cap.row(head.map(function (h) { return X.text(h, X.S_HEADER); }));
    for (var r = 0; r < records.length; r++) {
      var o = records[r] || {};
      var m = LG.kpi.calc(o);
      var row = [
        X.text(o.equipo, X.S_CELL), X.text(o.eco, X.S_CELL), X.text(o.marca, X.S_CELL),
        X.text(o.familia, X.S_CELL), X.text(o.departamento, X.S_CELL), X.text(o.ubicacion, X.S_CELL),
        X.text(o.estado, X.S_CELL), X.text(o.kpi !== false ? 'S\u00ed' : 'No', X.S_CELL),
        X.num(U.value(o, 'programadas')), X.num(U.value(o, 'inicio')), X.num(U.value(o, 'final')),
        X.num(U.value(o, 'mp')), X.num(U.value(o, 'mc')),
        X.num(m.trabajo), X.num(m.disponible), X.num(m.espera), X.pct(m.disponibilidad), X.pct(m.utilizacion)
      ];
      for (var q = 0; q < CSV_KEYS.length; q++) row.push(X.text(o[CSV_KEYS[q]], X.S_CELL));
      cap.row(row);
    }
    sheets.push(cap);

    var res = new X.Sheet('Resumen').cols([36, 16, 16, 16, 16, 16]);
    res.row([X.text('Resumen del turno', X.S_TITLE)]);
    res.row([X.text('Indicador', X.S_HEADER), X.text('Valor', X.S_HEADER)]);
    res.row([X.text('Horas del periodo', X.S_CELL), X.num(t[0])]);
    res.row([X.text('Trabajo', X.S_CELL), X.num(t[1])]);
    res.row([X.text('Preventivo MP', X.S_CELL), X.num(t[2])]);
    res.row([X.text('Correctivo MC', X.S_CELL), X.num(t[3])]);
    res.row([X.text('Espera', X.S_CELL), X.num(t[4])]);
    res.row([X.text('Disponibilidad mec\u00e1nica', X.S_CELL), X.pct(U.ratio(t[0] - t[2] - t[3], t[0]))]);
    res.row([X.text('Utilizaci\u00f3n efectiva', X.S_CELL), X.pct(U.ratio(t[1], t[0]))]);
    res.row([X.text('Uso de disponibilidad', X.S_CELL), X.pct(U.ratio(t[1], t[0] - t[2] - t[3]))]);
    res.row([X.text('Capturas KPI completas', X.S_CELL), X.num(t[5])]);
    res.row([X.text('Pendientes KPI', X.S_CELL), X.num(t[7])]);
    res.row([]);
    var fams = [], seen = {};
    for (var f = 0; f < records.length; f++) {
      var fam = safe((records[f] || {}).familia);
      if (!seen[fam]) { seen[fam] = true; fams.push(fam); }
    }
    res.row([X.text('Familia', X.S_HEADER), X.text('Equipos', X.S_HEADER), X.text('Periodo', X.S_HEADER),
      X.text('Trabajo', X.S_HEADER), X.text('Disponibilidad', X.S_HEADER), X.text('Utilizaci\u00f3n', X.S_HEADER)]);
    for (var g = 0; g < fams.length; g++) {
      var ft = totals(records, fams[g]);
      res.row([X.text(fams[g], X.S_CELL), X.num(ft[6]), X.num(ft[0]), X.num(ft[1]),
        X.pct(U.ratio(ft[0] - ft[2] - ft[3], ft[0])), X.pct(U.ratio(ft[1], ft[0]))]);
    }
    sheets.push(res);

    var turnList = tables.turns || [];
    if (turnList.length) {
      var hist = new X.Sheet('Historial').cols([13, 10, 22, 10, 12, 12, 12, 12, 12, 12, 12, 12]);
      hist.row([X.text('Historial por fecha y turno', X.S_TITLE)]);
      hist.row(['Fecha', 'Turno', 'Supervisor', 'Equipos', 'KPI', 'Completos', 'Periodo', 'Trabajo',
        'MP+MC', 'Disponibilidad', 'Utilizaci\u00f3n', 'Di\u00e9sel gal'].map(function (h) { return X.text(h, X.S_HEADER); }));
      for (var h2 = 0; h2 < turnList.length; h2++) {
        var turn = turnList[h2] || {};
        var hm = {}, data = [];
        try { hm = JSON.parse(turn.meta); } catch (e2) { hm = {}; }
        try { data = JSON.parse(turn.data); } catch (e2) { data = []; }
        var ht = totals(data, null);
        var fuel = LG.diesel.gallons(hm.diesel);
        hist.row([X.text(turn.date, X.S_CELL), X.text(turn.shift, X.S_CELL), X.text(hm.supervisor || '', X.S_CELL),
          X.num(data.length), X.num(ht[6]), X.num(ht[5]), X.num(ht[0]), X.num(ht[1]), X.num(ht[2] + ht[3]),
          X.pct(U.ratio(ht[0] - ht[2] - ht[3], ht[0])), X.pct(U.ratio(ht[1], ht[0])),
          U.finite(fuel) ? X.num(fuel) : X.text('\u2014', X.S_CELL)]);
      }
      sheets.push(hist);
    }

    var orders = tables.orders || [];
    if (orders.length) {
      var os = new X.Sheet('Ordenes').cols([26, 12, 30, 10, 10, 22, 40]);
      os.row([X.text('\u00d3rdenes de trabajo', X.S_TITLE)]);
      os.row(['Equipo', 'Estado', 'Descripci\u00f3n', 'Creada', 'Cerrada', 'Autor', 'ID'].map(function (h) { return X.text(h, X.S_HEADER); }));
      for (var oi = 0; oi < orders.length; oi++) {
        var ord = orders[oi] || {};
        os.row([X.text(ord.name, X.S_CELL), X.text(ord.status, X.S_CELL), X.text(ord.description, X.S_CELL),
          X.text(ord.created, X.S_CELL), X.text(ord.closed, X.S_CELL), X.text(ord.author, X.S_CELL), X.text(ord.id, X.S_CELL)]);
      }
      sheets.push(os);
    }

    var tasks = tables.preventive || [];
    if (tasks.length) {
      var ps = new X.Sheet('Preventivos').cols([30, 24, 13, 40, 13]);
      ps.row([X.text('Calendario preventivo', X.S_TITLE)]);
      ps.row(['Equipo', 'Detalles', 'Programado', 'Estado', 'ID'].map(function (h) { return X.text(h, X.S_HEADER); }));
      for (var pi = 0; pi < tasks.length; pi++) {
        var task = tasks[pi] || {};
        ps.row([X.text(task.name, X.S_CELL), X.text(task.details, X.S_CELL), X.text(task.due, X.S_CELL),
          X.text(task.status, X.S_CELL), X.text(task.id, X.S_CELL)]);
      }
      sheets.push(ps);
    }

    var ev = tables.evidence || [];
    if (ev.length) {
      var es = new X.Sheet('Evidencias').cols([28, 20, 12, 40, 24]);
      es.row([X.text('Evidencias del respaldo', X.S_TITLE)]);
      es.row(['Archivo', 'Turno', 'Tipo', 'Equipo', 'ID'].map(function (h) { return X.text(h, X.S_HEADER); }));
      for (var ei = 0; ei < ev.length; ei++) {
        var item = ev[ei] || {};
        es.row([X.text(item.fileName, X.S_CELL), X.text(item.turnKey, X.S_CELL), X.text(item.kind, X.S_CELL),
          X.text(item.equipmentId, X.S_CELL), X.text(item.id, X.S_CELL)]);
      }
      sheets.push(es);
    }

    return X.write(sheets);
  };

  /* ---- descarga / compartir ---- */
  R.download = function (data, filename, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

  R.share = function (blob, filename) {
    return new Promise(function (resolve) {
      try {
        var file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file], title: 'Reporte La Guitarra' }).then(function () { resolve(true); }, function (e) {
            resolve(!!(e && e.name === 'AbortError'));
          });
          return;
        }
      } catch (e) { }
      resolve(false);
    });
  };

  R.fileName = function (meta, ext) { return 'La-Guitarra-' + (meta && meta.fecha ? meta.fecha : U.today()) + ext; };
  R.CSV_KEYS = CSV_KEYS;
})();
