/* ReportDoc: puerto fiel de ReportRenderer.java (APK) a Canvas 2D.
   Dos páginas: registro completo de flota y tablero general. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;
  var B = LG.bytes;

  var C = {
    navy: '#032B4B', blue: '#1D4259', green: '#0F6F52', gold: '#BD923E', red: '#BA3A3E',
    ink: '#1D313B', muted: '#667780', pale: '#E5F3FC', white: '#FFFFFF',
    subtitle: '#D7E2E9', gold2: '#ECBF5B', rowFamily: '#DDEAF1', rowLine: '#E0E9ED',
    sep: '#D3DEE3', badgeOk: '#E1F2EA', badgeWait: '#FAF4E2', badgeBad: '#FBE5EA', wait2: '#FAF4E2',
    gray4: '#7799AC'
  };
  var COLUMNS = [280, 130, 110, 130, 140, 130, 140, 130, 140, 180, 130, 120, 190, 354];
  var HEADINGS = ['EQUIPO / IDENTIFICACIÓN', 'HORÓMETROS', 'PERCUSIÓN', 'PERIODO / TRABAJO',
    'H. TRABAJADAS (h)', 'MP / MC (h)', 'H. MANT. TOTAL (h)', 'ESPERA / DISP.', 'DISP. / UTIL.', 'ESTADO ACTUAL', 'ACEITES / INSUMOS',
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
          this.n(k.trabajo),
          (has || this.raw(item, 'mp') !== '' || this.raw(item, 'mc') !== '') ? 'MP: ' + this.s(item, 'mp') + '\nMC: ' + this.s(item, 'mc') : '\u2014',
          this.n(U.finite(k.mp) && U.finite(k.mc) && k.mp >= 0 && k.mc >= 0 ? k.mp + k.mc : NaN),
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
    var h = Math.max(1400, height + 165);
    this._rows = rows;
    this._pages = [
      { number: 1, width: 2400, height: h, pdfWidth: 1684, pdfHeight: Math.ceil(h * 1684 / 2400) },
      { number: 2, width: 1600, height: 620, pdfWidth: 842, pdfHeight: 327 }
    ];
    return this._pages;
  };

  Report.prototype.header = function(ctx,page,title,subtitle){
box(ctx,14,8,page.width-28,100,C.navy,0);
if(this.logo)ctx.drawImage(this.logo,0,0,77,43,36,26,98,55);
txt(ctx,"SIERRA MADRE",150,50,22,C.white,true);
txt(ctx,"M I N E R A L S",152,78,14,C.gold,true);
txt(ctx,"LA GUITARRA",page.width*0.29,45,27,C.white,true);
txt(ctx,"REPORTE DE MANTENIMIENTO DE EQUIPOS",page.width*0.29,72,16,C.white,false);
txt(ctx,this.date,page.width-315,40,18,C.white,true);
txt(ctx,"Turno: "+this.shift,page.width-315,64,14,C.white,false);
this.lines(ctx,"Supervisor: "+this.supervisor,page.width-315,87,12,295,C.white,false);

  };

  Report.prototype.footer = function (ctx, page) {
    var y = page.height - (page.number === 2 ? 17 : 41);
    box(ctx, 40, y - 20, page.width - 80, 1, C.sep, 0);
    txt(ctx, 'LA GUITARRA · Mantenimiento mecánico', 48, y + 7, 13, C.muted, false);
    txt(ctx, page.number + ' / 2', page.width - 107, y + 7, 15, C.navy, true);
  };

  Report.prototype.drawFleet = function (ctx, page) {
    this.header(ctx, page, 'REPORTE DE MANTENIMIENTO DE EQUIPOS', 'Registro completo del turno \u00b7 Supervisor: ' + this.supervisor);
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
      if (col === 4 || col === 6) box(ctx, x, y, COLUMNS[col], 34, "#F4C64E", 0);
      var h = this.wrap(HEADINGS[col], 11, COLUMNS[col] - 14, true);
      var baseline = y + (h.length > 1 ? 13 : 22);
      for (var hi = 0; hi < h.length; hi++) { txt(ctx, h[hi], x + 8, baseline, 11, (col === 4 || col === 6) ? C.navy : C.white, true); baseline += 12; }
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
          if (c2 === 4 || c2 === 6) box(ctx, x, y, COLUMNS[c2], row.height, "#FFF1C5", 0);
          if (c2 === 9) {
            var state = this.raw(row.item, 'estado');
            color = state === 'DISPONIBLE' ? C.green : state === 'POR CAPTURAR' ? C.gold : C.red;
            box(ctx, x + 5, y + 5, COLUMNS[c2] - 10, row.height - 10,
              state === 'DISPONIBLE' ? C.badgeOk : state === 'POR CAPTURAR' ? C.badgeWait : C.badgeBad, 5);
          }
          var line = 0;
          var cellLines = row.cells[c2];
          for (var li = 0; li < cellLines.length; li++) {
            txt(ctx, cellLines[li], x + 8, y + 18 + line * 17, 13, color, c2 === 0 || c2 === 9);
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
    this.lines(ctx, 'Horas trabajadas = horómetro final - inicial. Mantenimiento total = MP + MC (sin espera). El estado actual se captura por separado. \u2014 indica dato pendiente; Sin KPI identifica registros sin indicadores horarios. Las cantidades de insumos conservan la unidad capturada.', 48, y + 44, 14, 2304, C.muted, false);
    this.footer(ctx, page);
  };

  Report.prototype.metric = function (ctx, x, y, width, label, value, note, accent) {
    box(ctx, x, y, width, 120, C.white, 13);
    box(ctx, x, y, 5, 120, accent, 3);
    txt(ctx, label, x + 18, y + 28, 16, C.muted, true);
    txt(ctx, value, x + 18, y + 76, 40, accent, true);
    txt(ctx, note, x + 18, y + 103, 13, C.muted, false);
  };

  Report.prototype.drawDashboard = function(ctx,page){
var t=this.totals(null), f=this.fuel(), st=this.states(), avail=t[0]-t[2]-t[3];
this.header(ctx,page,'REPORTE DE MANTENIMIENTO DE EQUIPOS','Supervisor: '+this.supervisor);
txt(ctx,"INDICADORES GENERALES DEL TURNO",26,137,23,C.navy,true);
txt(ctx,(t[5]|0)+" / "+(t[6]|0)+" capturas KPI completas",650,137,14,C.navy,false);
box(ctx,26,150,378,70,C.pale,4);
txt(ctx,"Disponibilidad mecánica",42,173,16,C.navy,false);
txt(ctx,this.pct(U.ratio(avail,t[0])),42,207,31,C.navy,true);
box(ctx,416,150,378,70,C.pale,4);
txt(ctx,"Utilización efectiva",432,173,16,C.navy,false);
txt(ctx,this.pct(U.ratio(t[1],t[0])),432,207,31,C.navy,true);
box(ctx,806,150,378,70,C.pale,4);
txt(ctx,"Uso de disponibilidad",822,173,16,C.navy,false);
txt(ctx,this.pct(U.ratio(t[1],avail)),822,207,31,C.navy,true);
box(ctx,1196,150,378,70,C.pale,4);
txt(ctx,"Confiabilidad del formato",1212,173,16,C.navy,false);
txt(ctx,this.pct(U.ratio(t[0]-t[3],t[0])),1212,207,31,C.navy,true);
box(ctx,26,230,575,200,C.pale,4);
txt(ctx,"Distribución de horas",40,255,18,C.navy,true);
txt(ctx,"Concepto",40,279,13,C.blue,true);
txt(ctx,"Horas",310,279,13,C.blue,true);
txt(ctx,"% del turno",400,279,13,C.blue,true);
txt(ctx,"Trabajo",40,307,14,C.navy,false);
txt(ctx,t[5]>0?this.n(t[1])+" h":"—",310,307,14,C.navy,true);
txt(ctx,this.pct(U.ratio(t[1],t[0])),400,307,14,C.navy,false);
box(ctx,480,295,105,13,C.white,4);
box(ctx,480,295,t[0]>0?(105*t[1]/t[0]):0,13,C.blue,4);
txt(ctx,"MP (Mantenimiento programado)",40,338,14,C.navy,false);
txt(ctx,t[5]>0?this.n(t[2])+" h":"—",310,338,14,C.navy,true);
txt(ctx,this.pct(U.ratio(t[2],t[0])),400,338,14,C.navy,false);
box(ctx,480,326,105,13,C.white,4);
box(ctx,480,326,t[0]>0?(105*t[2]/t[0]):0,13,C.gold,4);
txt(ctx,"MC (Mantenimiento correctivo)",40,369,14,C.navy,false);
txt(ctx,t[5]>0?this.n(t[3])+" h":"—",310,369,14,C.navy,true);
txt(ctx,this.pct(U.ratio(t[3],t[0])),400,369,14,C.navy,false);
box(ctx,480,357,105,13,C.white,4);
box(ctx,480,357,t[0]>0?(105*t[3]/t[0]):0,13,C.gold,4);
txt(ctx,"Espera",40,400,14,C.navy,false);
txt(ctx,t[5]>0?this.n(t[4])+" h":"—",310,400,14,C.navy,true);
txt(ctx,this.pct(U.ratio(t[4],t[0])),400,400,14,C.navy,false);
box(ctx,480,388,105,13,C.white,4);
box(ctx,480,388,t[0]>0?(105*t[4]/t[0]):0,13,C.muted,4);
box(ctx,614,230,350,200,C.pale,4);
txt(ctx,"Control de diésel",628,255,18,C.navy,true);
var loaded=LG.diesel.gallons(this.diesel);
txt(ctx,"Total cargado",628,291,13,C.navy,false);
txt(ctx,U.finite(loaded)?this.n(loaded)+" gal":"—",845,291,14,C.navy,true);
txt(ctx,"Registrado por equipo",628,328,13,C.navy,false);
txt(ctx,f[1]>0?this.n(f[0])+" gal":"—",845,328,14,C.navy,true);
txt(ctx,"Cargas con unidad reconocida",628,365,13,C.navy,false);
txt(ctx,String(f[1]|0),845,365,14,C.navy,true);
txt(ctx,"Sin diésel capturado",628,402,13,C.navy,false);
txt(ctx,String(f[2]|0),845,402,14,C.navy,true);
box(ctx,977,230,597,200,C.pale,4);
txt(ctx,"Disponibilidad y utilización por familia",991,255,18,C.navy,true);
txt(ctx,"Familia",991,279,12,C.blue,true);
txt(ctx,"Capturas",1300,279,12,C.blue,true);
txt(ctx,"Disp.",1390,279,12,C.blue,true);
txt(ctx,"Util.",1490,279,12,C.blue,true);
var groups=[];this.records.forEach(function(o){if(o.kpi!==false&&groups.indexOf(o.familia)<0)groups.push(o.familia);}); var yy=305; for(var gi=0;gi<groups.length;gi++){var group=groups[gi], a=this.totals(group);
txt(ctx,group,991,yy,11,C.navy,false);
txt(ctx,(a[5]|0)+" / "+(a[6]|0),1300,yy,12,C.navy,false);
txt(ctx,this.pct(U.ratio(a[0]-a[2]-a[3],a[0])),1390,yy,12,C.navy,false);
txt(ctx,this.pct(U.ratio(a[1],a[0])),1490,yy,12,C.navy,false);
yy+=Math.min(25,115/Math.max(1,groups.length));}
box(ctx,26,442,1548,60,C.pale,4);
txt(ctx,"Cobertura y estado de la flota",40,466,16,C.navy,true);
txt(ctx,String(st[0]),430,470,24,C.green,true);
txt(ctx,"Disponibles",478,470,12,C.navy,false);
txt(ctx,String(st[1]),660,470,24,C.red,true);
txt(ctx,"No disponibles",708,470,12,C.navy,false);
txt(ctx,String(st[3]),890,470,24,C.navy,true);
txt(ctx,"Total equipos",938,470,12,C.navy,false);
txt(ctx,"Cobertura KPI",1150,465,14,C.navy,false);
txt(ctx,this.pct(U.ratio(t[5],t[6])),1390,478,26,C.navy,true);
txt(ctx,"Indicadores calculados con capturas KPI completas. Horas de mantenimiento = MP + MC. — Dato pendiente.",26,521,11,C.muted,false);
if(this.signature){ctx.drawImage(this.signature,1280,535,260,38);txt(ctx,"Firma del supervisor",1300,580,11,C.muted,true);}
this.footer(ctx,page);

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
    if (LG.videoEvidence) LG.videoEvidence.appendPages(this, pages);
    return LG.pdf.write(pages);
  };

  LG.reportDoc = { Report: Report, COLUMNS: COLUMNS, HEADINGS: HEADINGS };
})();
