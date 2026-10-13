/* ReportDoc: puerto fiel de ReportRenderer.java (APK) a Canvas 2D.
   Dos páginas: registro completo de flota y tablero general. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;
  var B = LG.bytes;

  var C = {
    navy: '#10273A', blue: '#1D4259', green: '#0F6F52', gold: '#BD923E', red: '#BA3A3E',
    ink: '#1D313B', muted: '#667780', pale: '#F1F6F8', white: '#FFFFFF',
    subtitle: '#D7E2E9', gold2: '#ECBF5B', rowFamily: '#DDEAF1', rowLine: '#E0E9ED',
    sep: '#D3DEE3', badgeOk: '#E1F2EA', badgeWait: '#FAF4E2', badgeBad: '#FBE5EA', wait2: '#FAF4E2',
    gray4: '#7799AC'
  };
  var COLUMNS = [340, 110, 100, 90, 90, 100, 100, 160, 210, 110, 230, 664];
  var HEADINGS = ['EQUIPO / IDENTIFICACIÓN', 'HORÓMETROS', 'PERCUSIÓN', 'PERIODO / TRABAJO',
    'MP / MC', 'ESPERA / DISP.', 'DISP. / UTIL.', 'ESTADO ACTUAL', 'ACEITES / INSUMOS',
    'DIÉSEL EQUIPO', 'UBICACIÓN / PERSONAL', 'OBSERVACIONES'];

  var mCanvas = null, mCtx = null;
  function mset(size, bold) {
    if (!mCtx) { mCanvas = document.createElement('canvas'); mCanvas.width = 8; mCanvas.height = 8; mCtx = mCanvas.getContext('2d'); }
    mCtx.font = (bold ? '600 ' : '') + size + 'px sans-serif';
  }
  function measure(s) { return mCtx.measureText(s).width; }

  function font(ctx, size, bold) { ctx.font = (bold ? '600 ' : '') + size + 'px sans-serif'; }

  function box(ctx, x, y, w, h, color, radius) {
    ctx.fillStyle = color;
    if (!radius) { ctx.fillRect(x, y, w, h); return; }
    var r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function txt(ctx, text, x, baseline, size, color, bold) {
    ctx.fillStyle = color;
    font(ctx, size, bold);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(text == null ? '' : text), x, baseline);
  }

  function wedge(ctx, cx, cy, r, a0, a1, color) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0 * Math.PI / 180, a1 * Math.PI / 180, false);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function Report(records, opts) {
    opts = opts || {};
    this.records = records || [];
    this.logo = opts.logo || null;
    this.signature = opts.signature || null;
    this.date = opts.date || '';
    this.supervisor = opts.supervisor || '';
    this.shift = opts.shift || '';
    this.diesel = opts.diesel || '';
    this._pages = null;
    this._rows = null;
  }

  Report.prototype.raw = function (o, k) { var v = o == null ? '' : o[k]; return v == null ? '' : String(v).trim(); };
  Report.prototype.s = function (o, k) { var v = this.raw(o, k); return v === '' ? '\u2014' : v; };
  Report.prototype.n = function (v) { return U.num(v); };
  Report.prototype.pct = function (v) { return U.pct(v); };

  Report.prototype.wrap = function (text, size, width, bold) {
    mset(size, bold);
    var lines = [];
    var paras = String(text == null ? '' : text).split('\n');
    for (var pi = 0; pi < paras.length; pi++) {
      var rest = paras[pi];
      if (rest === '') { lines.push(''); continue; }
      var guard = 0;
      while (rest.length > 0 && guard++ < 5000) {
        var len = 1, max = rest.length;
        while (len < max && measure(rest.substring(0, len + 1)) <= width) len++;
        if (measure(rest.substring(0, 1)) > width) len = 1;
        if (len < rest.length) {
          var space = rest.lastIndexOf(' ', len);
          if (space > 0) len = space;
        }
        lines.push(rest.substring(0, len));
        rest = rest.substring(len).replace(/^\s+/, '').replace(/\s+$/, '');
      }
    }
    return lines;
  };

  Report.prototype.lines = function (ctx, value, x, y, size, width, color, bold) {
    var ls = this.wrap(value, size, width, bold);
    for (var i = 0; i < ls.length; i++) txt(ctx, ls[i], x, y + i * (size + 5), size, color, bold);
  };

  Report.prototype.join = function (o, fields) {
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      if (this.raw(o, fields[i][0]) !== '') out.push(fields[i][1] + this.raw(o, fields[i][0]));
    }
    return out.length === 0 ? '\u2014' : out.join('\n');
  };

  Report.prototype.totals = function (family) {
    var t = [0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < this.records.length; i++) {
      var o = this.records[i];
      if (family != null && this.raw(o, 'familia') !== family) continue;
      if (o.kpi === false) continue;
      t[6]++;
      var k = LG.kpi.calc(o);
      if (k.completo) { t[0] += k.periodo; t[1] += k.trabajo; t[2] += k.mp; t[3] += k.mc; t[4] += k.espera; t[5]++; }
      else t[7]++;
    }
    return t;
  };

  Report.prototype.states = function () {
    var counts = [0, 0, 0, 0];
    for (var i = 0; i < this.records.length; i++) {
      var state = this.raw(this.records[i], 'estado');
      if (state === 'DISPONIBLE') counts[0]++;
      else if (state === 'POR CAPTURAR' || state === '') counts[2]++;
      else counts[1]++;
      counts[3]++;
    }
    return counts;
  };

  Report.prototype.fuel = function () {
    var f = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < this.records.length; i++) {
      var o = this.records[i];
      var value = this.raw(o, 'dieselEquipo');
      var amount = LG.diesel.gallons(value);
      if (U.finite(amount)) {
        f[0] += amount; f[1]++;
        var k = LG.kpi.calc(o);
        if (o.kpi !== false && k.completo) { f[4] += amount; f[5] += k.trabajo; }
      } else if (value === '') f[2]++; else f[3]++;
    }
    return f;
  };

  Report.prototype.pages = function () {
    if (this._pages) return this._pages;
    var groups = {}, order = [];
    for (var i = 0; i < this.records.length; i++) {
      var o = this.records[i];
      var f = this.raw(o, 'familia');
      if (f === '') f = 'OTROS';
      if (!Object.prototype.hasOwnProperty.call(groups, f)) { groups[f] = []; order.push(f); }
      groups[f].push(o);
    }
    var rows = [];
    var height = 278, index = 0;
    for (var g = 0; g < order.length; g++) {
      rows.push({ family: order[g], item: null, cells: null, height: 30, index: 0 });
      height += 30;
      var list = groups[order[g]];
      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        index++;
        var k = LG.kpi.calc(item);
        var has = item.kpi !== false;
        var self = this;
        var ident = (index < 10 ? '0' + index : '' + index) + '  ' + this.s(item, 'equipo') + '\nEco: ' + this.s(item, 'eco') + ' \u00b7 Marca: ' + this.s(item, 'marca');
        var values = [
          ident,
          (has || this.raw(item, 'inicio') !== '' || this.raw(item, 'final') !== '') ? 'I: ' + this.s(item, 'inicio') + '\nF: ' + this.s(item, 'final') : '\u2014',
          this.join(item, [['percInicio', 'I: '], ['percFinal', 'F: ']]),
          (has || this.raw(item, 'programadas') !== '' || U.finite(k.trabajo)) ? 'P: ' + this.s(item, 'programadas') + '\nT: ' + this.n(k.trabajo) : '\u2014',
          (has || this.raw(item, 'mp') !== '' || this.raw(item, 'mc') !== '') ? 'MP: ' + this.s(item, 'mp') + '\nMC: ' + this.s(item, 'mc') : '\u2014',
          has ? 'E: ' + this.n(k.espera) + '\nD: ' + this.n(k.disponible) : '\u2014',
          has ? 'D: ' + this.pct(k.disponibilidad) + '\nU: ' + this.pct(k.utilizacion) : 'Sin KPI',
          this.s(item, 'estado'),
          this.join(item, [['hidraulico', 'H: '], ['motor', 'M: '], ['transmision', 'T: ']]),
          this.s(item, 'dieselEquipo'),
          this.join(item, [['ubicacion', 'Ub.: '], ['departamento', 'Dep.: '], ['personal', 'Personal: ']]),
          this.s(item, 'observaciones')
        ];
        var cells = [], maxLines = 1;
        for (var col = 0; col < values.length; col++) {
          var cell = this.wrap(values[col], 13, COLUMNS[col] - 16, col === 0);
          cells.push(cell);
          if (cell.length > maxLines) maxLines = cell.length;
        }
        var rh = Math.max(38, maxLines * 17 + 10);
        rows.push({ family: null, item: item, cells: cells, height: rh, index: index });
        height += rh;
      }
    }
    var h = Math.max(1697, height + 165);
    this._rows = rows;
    this._pages = [
      { number: 1, width: 2400, height: h, pdfWidth: 1684, pdfHeight: Math.ceil(h * 1684 / 2400) },
      { number: 2, width: 1600, height: 1131, pdfWidth: 842, pdfHeight: 595 }
    ];
    return this._pages;
  };

  Report.prototype.header = function (ctx, page, title, subtitle) {
    var w = page.width;
    box(ctx, 0, 0, w, 150, C.navy, 0);
    box(ctx, w - 430, 0, 430, 150, C.blue, 0);
    box(ctx, 44, 24, 164, 98, C.white, 14);
    if (this.logo) { try { ctx.drawImage(this.logo, 0, 0, 77, 43, 54, 43, 144, 68); } catch (e) { } }
    txt(ctx, 'LA GUITARRA', 236, 55, 31, C.white, true);
    txt(ctx, title, 236, 94, 29, C.white, true);
    txt(ctx, subtitle, 236, 126, 16, C.subtitle, false);
    txt(ctx, 'CONTROL DE FLOTA', w - 386, 47, 20, C.gold2, true);
    txt(ctx, this.date, w - 386, 82, 25, C.white, true);
    this.lines(ctx, 'Turno: ' + this.shift, w - 386, 113, 16, 340, C.white, false);
  };

  Report.prototype.footer = function (ctx, page) {
    var y = page.height - 41;
    box(ctx, 40, y - 20, page.width - 80, 1, C.sep, 0);
    txt(ctx, 'LA GUITARRA COMPAÑÍA MINERA S.A. DE C.V.  \u00b7  Mantenimiento mecánico', 48, y + 7, 13, C.muted, false);
    txt(ctx, page.number + ' / 2', page.width - 107, y + 7, 15, C.navy, true);
  };

  Report.prototype.drawFleet = function (ctx, page) {
    this.header(ctx, page, 'DISPONIBILIDAD DE EQUIPOS', 'Registro completo del turno \u00b7 Supervisor: ' + this.supervisor);
    var counts = this.states();
    var labels = ['DISPONIBLES', 'NO DISPONIBLES / MANTENIMIENTO', 'POR CAPTURAR', 'TOTAL DE EQUIPOS'];
    var colors = [C.green, C.red, C.gold, C.blue];
    var cw = 566;
    for (var i = 0; i < 4; i++) {
      var x0 = 48 + i * 578;
      box(ctx, x0, 166, cw, 64, C.pale, 10);
      box(ctx, x0, 166, 5, 64, colors[i], 3);
      txt(ctx, String(counts[i]), x0 + 18, 195, 24, C.navy, true);
      txt(ctx, labels[i], x0 + 18, 217, 12, C.muted, true);
    }
    var x = 48, y = 244;
    box(ctx, x, y, 2304, 34, C.navy, 7);
    for (var col = 0; col < COLUMNS.length; col++) {
      var h = this.wrap(HEADINGS[col], 11, COLUMNS[col] - 14, true);
      var baseline = y + (h.length > 1 ? 13 : 22);
      for (var hi = 0; hi < h.length; hi++) { txt(ctx, h[hi], x + 8, baseline, 11, C.white, true); baseline += 12; }
      x += COLUMNS[col];
    }
    y = 278;
    var rows = this._rows;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row.family != null) {
        box(ctx, 48, y, 2304, row.height, C.rowFamily, 0);
        box(ctx, 48, y, 5, row.height, C.green, 0);
        txt(ctx, row.family, 64, y + 21, 15, C.blue, true);
      } else {
        x = 48;
        box(ctx, x, y, 2304, row.height, (row.index % 2 === 0) ? C.pale : C.white, 0);
        for (var c2 = 0; c2 < COLUMNS.length; c2++) {
          var color = C.ink;
          if (c2 === 7) {
            var state = this.raw(row.item, 'estado');
            color = state === 'DISPONIBLE' ? C.green : state === 'POR CAPTURAR' ? C.gold : C.red;
            box(ctx, x + 5, y + 5, COLUMNS[c2] - 10, row.height - 10,
              state === 'DISPONIBLE' ? C.badgeOk : state === 'POR CAPTURAR' ? C.badgeWait : C.badgeBad, 5);
          }
          var line = 0;
          var cellLines = row.cells[c2];
          for (var li = 0; li < cellLines.length; li++) {
            txt(ctx, cellLines[li], x + 8, y + 18 + line * 17, 13, color, c2 === 0 || c2 === 7);
            line++;
          }
          x += COLUMNS[c2];
        }
        box(ctx, 48, y + row.height - 1, 2304, 1, C.rowLine, 0);
      }
      y += row.height;
    }
    y += 23;
    this.lines(ctx, 'LECTURA DEL REGISTRO  \u00b7  I / F: inicial / final. P / T: periodo / trabajo. MP / MC: preventivo / correctivo. E / D: espera / horas disponibles. D / U: disponibilidad mecánica / utilización efectiva. H / M / T: aceite hidráulico / motor / transmisión.', 48, y, 14, 2304, C.muted, false);
    this.lines(ctx, 'Las horas trabajadas se calculan con los horómetros. El estado actual se captura por separado. \u2014 indica dato pendiente; Sin KPI identifica registros sin indicadores horarios. Las cantidades de insumos conservan la unidad capturada.', 48, y + 44, 14, 2304, C.muted, false);
    this.footer(ctx, page);
  };

  Report.prototype.metric = function (ctx, x, y, width, label, value, note, accent) {
    box(ctx, x, y, width, 120, C.white, 13);
    box(ctx, x, y, 5, 120, accent, 3);
    txt(ctx, label, x + 18, y + 28, 16, C.muted, true);
    txt(ctx, value, x + 18, y + 76, 40, accent, true);
    txt(ctx, note, x + 18, y + 103, 13, C.muted, false);
  };

  Report.prototype.drawDashboard = function (ctx, page) {
    this.header(ctx, page, 'INDICADORES GENERALES DEL TURNO', 'Disponibilidad, utilización y control de diésel \u00b7 Supervisor: ' + this.supervisor);
    box(ctx, 0, 150, 1600, 941, C.pale, 0);
    var t = this.totals(null), fuel = this.fuel();
    var avail = t[0] - t[2] - t[3];
    var captured = t[5] | 0, pending = t[7] | 0;

    txt(ctx, captured + ' / ' + (t[6] | 0) + ' capturas KPI completas  \u00b7  ' + pending + ' pendientes  \u00b7  ' + (this.records.length - (t[6] | 0)) + ' registros sin KPI', 48, 179, 17, C.muted, false);
    this.metric(ctx, 48, 199, 358, 'DISPONIBILIDAD MECÁNICA', this.pct(U.ratio(avail, t[0])), 'Horas disponibles / periodo', C.green);
    this.metric(ctx, 430, 199, 358, 'UTILIZACIÓN EFECTIVA', this.pct(U.ratio(t[1], t[0])), 'Trabajo / periodo', C.blue);
    this.metric(ctx, 812, 199, 358, 'USO DE DISPONIBILIDAD', this.pct(U.ratio(t[1], avail)), 'Trabajo / horas disponibles', C.gold);
    this.metric(ctx, 1194, 199, 358, 'CONFIABILIDAD DEL FORMATO', this.pct(U.ratio(t[0] - t[3], t[0])), '(Periodo - MC) / periodo', C.navy);

    box(ctx, 48, 338, 730, 282, C.white, 13);
    txt(ctx, 'Distribución de horas', 68, 372, 23, C.navy, true);
    var colors = [C.green, C.gold, C.red, C.gray4];
    var times = [t[1], t[2], t[3], t[4]];
    var names = ['Trabajo', 'Preventivo MP', 'Correctivo MC', 'Espera / stand by'];
    var cx = 166.5, cy = 487.5, rr = 93.5;
    var angle = -90;
    for (var i = 0; i < 4; i++) {
      var sweep = t[0] > 0 ? times[i] * 360 / t[0] : 0;
      if (sweep > 0) wedge(ctx, cx, cy, rr, angle, angle + sweep, colors[i]);
      angle += sweep;
    }
    if (t[0] === 0) wedge(ctx, cx, cy, rr, 0, 360, C.pale);
    box(ctx, 108, 429, 117, 117, C.white, 60);
    txt(ctx, captured > 0 ? this.n(t[0]) : '\u2014', 126, 484, 25, C.navy, true);
    txt(ctx, 'HORAS', 137, 509, 12, C.muted, true);
    for (var k = 0; k < 4; k++) {
      var yy = 410 + k * 43;
      box(ctx, 290, yy - 13, 11, 11, colors[k], 3);
      txt(ctx, names[k], 310, yy, 17, C.ink, false);
      txt(ctx, captured > 0 ? this.n(times[k]) + ' h' : '\u2014', 612, yy, 17, C.ink, true);
    }
    txt(ctx, 'Paro total: ' + (captured > 0 ? this.n(t[2] + t[3] + t[4]) + ' h' : '\u2014') + '  \u00b7  Disponibles: ' + (captured > 0 ? this.n(avail) + ' h' : '\u2014'), 290, 589, 15, C.muted, false);

    box(ctx, 804, 338, 748, 282, C.white, 13);
    txt(ctx, 'Control de diésel', 824, 372, 23, C.navy, true);
    var loaded = LG.diesel.gallons(this.diesel);
    txt(ctx, 'TOTAL CARGADO', 824, 407, 13, C.muted, true);
    txt(ctx, U.finite(loaded) ? this.n(loaded) + ' gal' : '\u2014', 824, 450, 35, C.navy, true);
    txt(ctx, U.finite(loaded) ? this.n(loaded * LG.diesel.LITERS_PER_GALLON) + ' L' : 'Sin captura del total', 824, 477, 16, C.muted, false);
    txt(ctx, 'REGISTRADO POR EQUIPO', 1180, 407, 13, C.muted, true);
    txt(ctx, fuel[1] > 0 ? this.n(fuel[0]) + ' gal' : '\u2014', 1180, 450, 35, C.green, true);
    txt(ctx, (fuel[1] | 0) + ' cargas con unidad reconocida', 1180, 477, 15, C.muted, false);
    var difference = U.finite(loaded) && fuel[1] > 0 ? this.n(loaded - fuel[0]) + ' gal' : '\u2014';
    txt(ctx, 'Diferencia carga - registros: ' + difference, 824, 512, 17, C.ink, true);
    txt(ctx, 'Carga / h de equipos con lecturas: ' + (fuel[5] > 0 ? this.n(fuel[4] * LG.diesel.LITERS_PER_GALLON / fuel[5]) + ' L/h' : '\u2014'), 824, 541, 17, C.ink, false);
    txt(ctx, (fuel[2] | 0) + ' equipos sin diésel capturado  \u00b7  ' + (fuel[3] | 0) + ' cantidades sin unidad reconocida', 824, 573, 14, C.muted, false);
    txt(ctx, 'Control de carga registrada; no equivale a consumo medido.', 824, 603, 13, C.muted, false);

    box(ctx, 48, 641, 1002, 321, C.white, 13);
    txt(ctx, 'Disponibilidad y utilización por familia', 68, 676, 22, C.navy, true);
    var fams = [], seen = {};
    for (var m = 0; m < this.records.length; m++) {
      if (this.records[m].kpi === false) continue;
      var fam = this.raw(this.records[m], 'familia');
      if (!seen[fam]) { seen[fam] = true; fams.push(fam); }
    }
    var count = Math.max(1, fams.length), rowH = Math.min(34, 244 / count), yy2 = 705;
    txt(ctx, 'FAMILIA', 68, yy2, 12, C.muted, true);
    txt(ctx, 'CAPTURA', 460, yy2, 12, C.muted, true);
    txt(ctx, 'DISPONIBILIDAD', 565, yy2, 12, C.muted, true);
    txt(ctx, 'UTILIZACIÓN', 813, yy2, 12, C.muted, true);
    yy2 += 20;
    for (var g = 0; g < fams.length; g++) {
      var name = fams[g];
      var f = this.totals(name);
      var fsize = name.length > 29 ? 12 : 14;
      txt(ctx, name, 68, yy2, fsize, C.ink, true);
      txt(ctx, (f[5] | 0) + '/' + (f[6] | 0), 468, yy2, 14, C.muted, false);
      var d = U.ratio(f[0] - f[2] - f[3], f[0]), u = U.ratio(f[1], f[0]);
      box(ctx, 565, yy2 - 12, 112, 12, C.pale, 3);
      if (U.finite(d)) box(ctx, 565, yy2 - 12, Math.max(0, Math.min(112, 112 * d)), 12, C.green, 3);
      txt(ctx, this.pct(d), 690, yy2, 14, C.ink, true);
      box(ctx, 813, yy2 - 12, 112, 12, C.pale, 3);
      if (U.finite(u)) box(ctx, 813, yy2 - 12, Math.max(0, Math.min(112, 112 * u)), 12, C.blue, 3);
      txt(ctx, this.pct(u), 938, yy2, 14, C.ink, true);
      yy2 += rowH;
    }

    box(ctx, 1075, 641, 477, 321, C.white, 13);
    txt(ctx, 'Cobertura y estado de la flota', 1095, 676, 21, C.navy, true);
    var st = this.states();
    var status = ['Disponibles', 'No disponibles / mantenimiento', 'Por capturar', 'Total del catálogo'];
    for (var q = 0; q < 4; q++) {
      txt(ctx, status[q], 1095, 715 + q * 42, 16, C.muted, false);
      txt(ctx, String(st[q]), 1490, 715 + q * 42, 22, C.navy, true);
    }
    txt(ctx, 'Cobertura KPI', 1095, 895, 16, C.muted, true);
    txt(ctx, this.pct(U.ratio(t[5], t[6])), 1390, 895, 22, C.green, true);
    txt(ctx, 'Estado actual y KPI del periodo son distintos.', 1095, 932, 13, C.muted, false);

    this.lines(ctx, 'BASE DE CÁLCULO  \u00b7  Solo capturas KPI completas. Se suman horas antes de calcular porcentajes. Trabajo = horómetro final - inicial. Disponibilidad = (periodo - MP - MC) / periodo. Utilización = trabajo / periodo. Uso de disponibilidad = trabajo / horas disponibles.', 48, 994, 13, this.signature == null ? 1504 : 1200, C.muted, false);
    this.lines(ctx, 'DIÉSEL  \u00b7  Se reconocen gal y L; cantidades sin unidad se interpretan en gal. 1 gal = 3.7854 L (galón estadounidense). La diferencia de carga es parcial si faltan registros. La carga por hora usa únicamente los equipos con diésel reconocido y lecturas completas.', 48, 1037, 13, this.signature == null ? 1504 : 1200, C.muted, false);
    if (this.signature) {
      try { ctx.drawImage(this.signature, 1310, 970, 242, 80); } catch (e) { }
      txt(ctx, 'Firma del supervisor', 1320, 1069, 12, C.muted, true);
    }
    this.footer(ctx, page);
  };

  Report.prototype.draw = function (ctx, page) {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, page.width, page.height);
    if (page.number === 1) this.drawFleet(ctx, page); else this.drawDashboard(ctx, page);
  };

  Report.prototype.render = function (page) {
    var canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;
    var ctx = canvas.getContext('2d');
    this.draw(ctx, page);
    return canvas;
  };

  /* PNG único apilando ambas páginas al ancho de la primera. */
  Report.prototype.png = function () {
    var all = this.pages();
    var width = 2400, totalH = 0, i;
    for (i = 0; i < all.length; i++) totalH += Math.ceil(width * all[i].height / all[i].width);
    var out = document.createElement('canvas');
    out.width = width; out.height = totalH;
    var ctx = out.getContext('2d');
    ctx.fillStyle = C.white; ctx.fillRect(0, 0, width, totalH);
    var y = 0;
    for (i = 0; i < all.length; i++) {
      var pc = this.render(all[i]);
      var h = Math.ceil(width * all[i].height / all[i].width);
      ctx.drawImage(pc, 0, y, width, h);
      y += h;
    }
    return out;
  };

  /* PDF con una página por hoja (JPEG incrustado). Devuelve Uint8Array. */
  Report.prototype.pdf = function () {
    var all = this.pages();
    var pages = [];
    for (var i = 0; i < all.length; i++) {
      var canvas = this.render(all[i]);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      var jpeg = B.fromBase64(dataUrl.split(',')[1]);
      pages.push({ jpeg: jpeg, imgW: all[i].width, imgH: all[i].height, pageW: all[i].pdfWidth, pageH: all[i].pdfHeight });
    }
    return LG.pdf.write(pages);
  };

  LG.reportDoc = { Report: Report, COLUMNS: COLUMNS, HEADINGS: HEADINGS };
})();
