/* La Guitarra · Control de flota — interfaz principal del PWA.
   Puerto fiel de MainActivity.java + OperationsUI.java del APK (Android). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util, S = LG.store, R = LG.reports, M = LG.media, Sync = LG.sync;

  /* Colores del APK. */
  var INK = '#172F2B', GREEN = '#0F604C', MUTED = '#637570';
  var CHART = ['#2C9E65', '#EB792B', '#CD444B', '#D7A426'];
  var STATES = ['POR CAPTURAR', 'DISPONIBLE', 'NO DISPONIBLE', 'EN MANTENIMIENTO', 'FUERA DE SERVICIO'];
  var FILTER_STATES = ['Todos los estados', 'DISPONIBLE', 'EN MANTENIMIENTO', 'FUERA DE SERVICIO', 'NO DISPONIBLE', 'POR CAPTURAR'];
  var FILTER_KPI = ['Todos los equipos', 'Con KPI', 'Sin KPI'];

  var app = (LG.app = {
    records: [], meta: {}, user: '', role: '',
    signature: '', signatureTurn: '', logo: null, screen: 0, ready: false
  });
  var dom = { body: null };
  var eq = {};

  /* ======================= utilidades ======================= */
  function e(tag, cls) { var d = document.createElement(tag); if (cls) d.className = cls; return d; }
  function opt(v) { return v == null ? '' : String(v); }
  function modalRoot() { return document.getElementById('modal-root') || document.body; }

  function t(parent, value, size, color, bold, tag) {
    var d = e(tag || 'div', 'txt');
    d.textContent = value == null ? '' : String(value);
    if (size) d.style.fontSize = size + 'px';
    if (color) d.style.color = color;
    d.style.fontWeight = bold ? '600' : '400';
    if (parent) parent.appendChild(d);
    return d;
  }
  function row(parent, cls) { var r = e('div', 'row' + (cls ? ' ' + cls : '')); if (parent) parent.appendChild(r); return r; }
  function card(parent) { var c = e('div', 'card'); if (parent) parent.appendChild(c); return c; }

  function btn(parent, label, filled, action, cls) {
    var b = e('button', 'btn' + (filled ? ' filled' : '') + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.textContent = label;
    b.onclick = function (ev) { ev.preventDefault(); action(ev); };
    if (parent) parent.appendChild(b);
    return b;
  }

  var fieldSequence=0;
  function field(parent, label, value, numeric) {
    var fieldLabel=t(parent, label, 12, MUTED, true,'label');
    var multiline = /^(Observaciones|Personal)/.test(opt(label));
    var el = e(multiline ? 'textarea' : 'input', 'field');
    el.value = opt(value);el.id='lg-field-'+(++fieldSequence);fieldLabel.htmlFor=el.id;
    if (multiline) el.rows = 2;
    else { el.type = 'text'; if (numeric) el.setAttribute('inputmode', 'decimal'); }
    parent.appendChild(el);
    return el;
  }
  function dateField(parent, label, value) {
    var el = field(parent, label, value, false);
    el.type = 'date';
    return el;
  }
  function selectEl(values, selected) {
    var s = e('select', 'select');
    for (var i = 0; i < values.length; i++) {
      var o = e('option'); o.value = values[i]; o.textContent = values[i];
      if (selected != null && values[i] === selected) o.selected = true;
      s.appendChild(o);
    }
    return s;
  }
  function pairField(parent, label, value) {
    var col = e('div', 'pair'); parent.appendChild(col);
    return field(col, label, value, true);
  }
  function spinner(parent, label, values, selected) {
    var labelEl=t(parent, label, 12, MUTED, true,'label');
    var s = selectEl(values, selected);s.id='lg-select-'+(++fieldSequence);labelEl.htmlFor=s.id;
    parent.appendChild(s);
    return s;
  }

  function toast(message) {
    var d = e('div', 'toast'); d.textContent = message;
    modalRoot().appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 2600);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 3200);
  }

  function busyOverlay(message) {
    var overlay = e('div', 'overlay');
    var panel = e('div', 'busy');
    panel.appendChild(e('div', 'spinner'));
    var msg = e('div', 'busy-msg'); msg.textContent = message; panel.appendChild(msg);
    overlay.appendChild(panel);
    modalRoot().appendChild(overlay);
    return { remove: function () { if (overlay.parentNode) overlay.remove(); } };
  }

  function error(err) {
    if (err && err.message === 'dup') return;
    toast(err && err.message ? err.message : 'No se complet\u00f3 la operaci\u00f3n');
  }

  /* ======================= modales ======================= */
  function openModal(title, opts) {
    opts = opts || {};
    var overlay = e('div', 'overlay');
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',title);
    var panel = e('div', 'modal' + (opts.full ? ' full' : ''));
    var head = e('div', 'modal-head');
    var h = e('div', 'modal-title'); h.textContent = title; head.appendChild(h);
    if (!opts.noClose) { var x = e('button', 'modal-x'); x.type = 'button'; x.textContent = '\u00d7';x.setAttribute('aria-label','Cerrar'); head.appendChild(x); }
    var content = e('div', 'modal-body');
    panel.appendChild(head); panel.appendChild(content);
    overlay.appendChild(panel);
    modalRoot().appendChild(overlay);
    var api = {
      overlay: overlay, panel: panel, content: content, onClose: null,
      close: function () { if (api.onClose) { try { api.onClose(); } catch (er) { } } if (overlay.parentNode) overlay.remove(); }
    };
    if (!opts.noClose) head.querySelector('.modal-x').onclick = api.close;
    return api;
  }

  function alertDialog(o) {
    var m = openModal(o.title || '', { noClose: true });
    if (o.message) t(m.content, o.message, 14, INK, false);
    var actions = e('div', 'modal-actions'); m.content.appendChild(actions);
    if (o.negative) btn(actions, o.negative, false, function () { m.close(); if (o.onNegative) o.onNegative(); });
    if (o.neutral) btn(actions, o.neutral, false, function () { m.close(); if (o.onNeutral) o.onNeutral(); });
    if (o.positive) btn(actions, o.positive, true, function () { m.close(); if (o.onPositive) o.onPositive(); });
    return m;
  }

  /* ======================= estado ======================= */
  function key() { return S.turnKey(app.meta.fecha || U.today(), app.meta.turno || 'D\u00eda'); }
  function profileLabel() { return app.user ? (app.user + ' \u00b7 ' + app.role) : 'Inicia sesi\u00f3n \u00b7 perfiles locales'; }
  function canAdmin() { return app.role === 'Administrador'; }
  function canCapture() { if (!app.user) { profiles(); return false; } return true; }
  function canSupervise() {
    if (app.role === 'Administrador' || app.role === 'Supervisor') return true;
    toast('Esta acci\u00f3n requiere Supervisor o Administrador'); return false;
  }
  function hasCapture() {
    for (var i = 0; i < app.records.length; i++) {
      var o = app.records[i] || {};
      if (opt(o.actualizado) !== '' || opt(o.final) !== '' || (opt(o.estado) !== '' && o.estado !== 'POR CAPTURAR')) return true;
    }
    return false;
  }
  function fallback(v) { return opt(v).trim() === '' ? '\u2014' : v; }

  function meta() {
    var o = app.meta || {};
    return {
      fecha: o.fecha || U.today(), turno: o.turno || 'D\u00eda', supervisor: o.supervisor || '',
      diesel: o.diesel || '', signature: app.signatureTurn === key() ? app.signature : '',
      profile: profileLabel()
    };
  }
  function applyMeta(o) {
    o = o || {};
    app.meta = { fecha: o.fecha || U.today(), turno: o.turno || 'D\u00eda', supervisor: o.supervisor || '', diesel: o.diesel || '' };
    app.signature = o.signature || '';
    app.signatureTurn = S.turnKey(app.meta.fecha, app.meta.turno);
  }
  function saveMeta() { if (app.ready) S.meta(meta()); }
  function saveRecords() { return S.setCurrent(app.records, meta()); }

  function clearDrafts() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('lg:draft-') === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) localStorage.removeItem(keys[j]);
    } catch (er) { }
  }

  /* ======================= cálculos ======================= */
  function totals() {
    var t0 = [0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < app.records.length; i++) {
      var o = app.records[i] || {};
      if (o.kpi === false) continue;
      t0[6]++;
      var k = LG.kpi.calc(o);
      if (k.completo) { t0[0] += k.periodo; t0[1] += k.trabajo; t0[2] += k.mp; t0[3] += k.mc; t0[4] += k.espera; t0[5]++; }
      else t0[7]++;
    }
    return t0;
  }
  function fleetCounts() {
    var n = [0, 0, 0, 0];
    for (var i = 0; i < app.records.length; i++) {
      var st = opt((app.records[i] || {}).estado);
      if (st === 'DISPONIBLE') n[0]++;
      else if (st === 'EN MANTENIMIENTO') n[1]++;
      else if (st === 'POR CAPTURAR' || st === '') n[3]++;
      else n[2]++;
    }
    return n;
  }
  function statusColor(status) {
    if (status === 'DISPONIBLE') return CHART[0];
    if (status === 'EN MANTENIMIENTO') return CHART[1];
    if (status === 'POR CAPTURAR' || status === '') return CHART[3];
    return CHART[2];
  }

  /* ======================= widgets ======================= */
  function barChart(counts) {
    var wrap = e('div', 'bar-chart');
    var total = 0; for (var i = 0; i < counts.length; i++) total += counts[i];
    if (total <= 0) return wrap;
    for (var j = 0; j < counts.length; j++) {
      if (counts[j] <= 0) continue;
      var seg = e('div', 'seg'); seg.style.flex = String(counts[j]); seg.style.background = CHART[j];
      wrap.appendChild(seg);
    }
    return wrap;
  }
  function donut(counts, label) {
    var total = 0; for (var i = 0; i < counts.length; i++) total += counts[i];
    var wrap = e('div', 'donut');
    if (total > 0) {
      var stops = [], acc = 0;
      for (var j = 0; j < counts.length; j++) {
        if (counts[j] <= 0) continue;
        var from = acc / total * 360, to = (acc + counts[j]) / total * 360;
        stops.push(CHART[j] + ' ' + from.toFixed(2) + 'deg ' + to.toFixed(2) + 'deg');
        acc += counts[j];
      }
      wrap.style.background = 'conic-gradient(from -90deg,' + stops.join(',') + ')';
    } else { wrap.style.background = '#EDF3EF'; }
    var inner = e('div', 'donut-inner'); inner.textContent = label || '';
    wrap.appendChild(inner);
    return wrap;
  }
  function metricInto(rowEl, label, amount, subtitle, color, ratio) {
    var c = e('div', 'metric'); rowEl.appendChild(c);
    t(c, label, 12, MUTED, true);
    t(c, amount, 27, INK, true);
    var bar = e('div', 'bar');
    var fill = e('div', 'bar-fill');
    fill.style.width = (U.finite(ratio) ? Math.max(0, Math.min(1, ratio)) * 100 : 0) + '%';
    fill.style.background = color;
    bar.appendChild(fill); c.appendChild(bar);
    var s = t(c, subtitle, 11, color, false); s.style.color = color;
  }
  function stateLegend(parent, n) {
    var names = ['Disponibles', 'En mantenimiento', 'Fuera de servicio', 'Por capturar'];
    var keys = [0, 1, 2, 3];
    for (var i = 0; i < 4; i++) {
      var r = e('div', 'legend-row');
      var dot = e('span', 'legend-dot'); dot.style.background = CHART[keys[i]]; r.appendChild(dot);
      var lab = t(r, names[i], 12, INK, false); lab.style.flex = '1';
      t(r, String(n[keys[i]]), 14, INK, true);
      parent.appendChild(r);
    }
  }
  function navIcon(type) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'nav-icon');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    function rect(x, y, w, h, r) { var el = document.createElementNS(NS, 'rect'); el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h); el.setAttribute('rx', r); svg.appendChild(el); }
    function line(x1, y1, x2, y2) { var el = document.createElementNS(NS, 'line'); el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); svg.appendChild(el); }
    function circle(cx, cy, r) { var el = document.createElementNS(NS, 'circle'); el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r); svg.appendChild(el); }
    if (type === 0) { line(2,11,12,3);line(12,3,22,11);line(5,9,5,21);line(19,9,19,21);line(5,21,19,21);rect(10,14,4,7,0); }
    else if (type === 1) { rect(5, 4, 14, 17, 2); rect(9, 2, 6, 4, 1); line(9, 11, 15, 11); line(9, 16, 15, 16); }
    else if (type === 2) { rect(2, 8, 13, 10, 2); line(15, 11, 20, 11); line(20, 11, 22, 16); line(22, 16, 22, 18); line(15, 18, 22, 18); circle(7, 19, 2); circle(19, 19, 2); }
    else { rect(3,13,3,8,1);rect(10,8,3,13,1);rect(17,3,3,18,1); }
    return svg;
  }
  function expandable(parent, title, open) {
    var wrap = card(parent);
    var heading = t(wrap, title, 16, INK, true); heading.classList.add('link');
    var arrow = e('span', 'caret'); arrow.textContent = open ? '\u25be' : '\u25b8'; heading.appendChild(arrow);
    var content = e('div', 'expand'); wrap.appendChild(content);
    content.style.display = open ? 'block' : 'none';
    heading.onclick = function () {
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
      arrow.textContent = content.style.display === 'none' ? '\u25b8' : '\u25be';
    };
    return content;
  }

  /* ======================= arranque ======================= */
  function boot() {
    S.load().then(function () {
      if (S.initialized()) app.records = S.current();
      return LG.catalog.load().then(function (catalog) {
        if (!S.initialized()) {
          app.records = LG.catalog.reconcile(catalog, app.records);
          return S.setCurrent(app.records, { fecha: U.today(), turno: 'D\u00eda', supervisor: '', diesel: '' });
        }
        return null;
      });
    }).then(function () {
      var m = {};
      try { m = JSON.parse(S.setting('meta') || '{}'); } catch (er) { m = {}; }
      if (!m.fecha) m = { fecha: U.today(), turno: 'D\u00eda', supervisor: '', diesel: '' };
      applyMeta(m);
      app.ready = true;
      return M.image('assets/referencia.jpg').then(function (img) { app.logo = img; }, function () { app.logo = null; });
    }).then(function () {
      show(0);
      var users = S.rows('users');
      if (users.length === 0) createProfile(true); else profiles();
    }).catch(function (err) {
      var root = document.getElementById('app');
      if (!root) return;
      root.innerHTML = '';
      t(root, 'No fue posible iniciar: ' + (err && err.message ? err.message : err), 15, CHART[2], true);
    });
  }

  function captured(o) { return o.kpi === false ? !!o.actualizado : LG.kpi.calc(o).completo; }
  function shortDate(date) { return new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function heading(parent, title, subtitle) { var h=e('div','page-heading');t(h,title,26,INK,true);if(subtitle)t(h,subtitle,14,MUTED,false);parent.appendChild(h);return h; }
  function machine(o) {
    var wrap=e('div','machine-art');var family=opt(o.familia);var svg='';
    var wheels='<g fill="#25342f" stroke="#15221d" stroke-width="2"><circle cx="42" cy="82" r="15"/><circle cx="116" cy="82" r="15"/></g><g fill="#69746d"><circle cx="42" cy="82" r="7"/><circle cx="116" cy="82" r="7"/></g>';
    if(family.indexOf('BARREN')>=0) svg='<path d="M27 68h85v14H27z" fill="#d49b27"/><path d="M37 46h37v29H37z" fill="#edbd48"/><path d="M43 49h22v16H43z" fill="#34483f"/><path d="M72 51L116 19l28 3M80 57l40-32" fill="none" stroke="#d7a334" stroke-width="8"/><path d="M108 19l36-10M122 22l29-8" stroke="#3c4942" stroke-width="5"/><path d="M144 12l5 43" stroke="#526157" stroke-width="3"/>'+wheels;
    else if(family.indexOf('CARGADORES')>=0) svg='<path d="M22 60h69v18H22zM35 37h35l9 36H35z" fill="#edb73e"/><path d="M42 42h20l7 20H42z" fill="#34483f"/><path d="M81 69l29-17 22 18" fill="none" stroke="#d99e2d" stroke-width="9"/><path d="M120 64l28 14 10 15h-42z" fill="#d1a03c" stroke="#947324" stroke-width="2"/>'+wheels;
    else svg='<path d="M17 35h105l-15 30H42z" fill="#edb73e"/><path d="M100 45h34l19 31h-53z" fill="#dbab39"/><path d="M112 49h17l9 15h-26z" fill="#34483f"/><path d="M28 69h115v9H28z" fill="#b68b2b"/>'+wheels;
    wrap.innerHTML='<svg viewBox="0 0 170 110" aria-hidden="true"><ellipse cx="85" cy="98" rx="65" ry="5" fill="#d9ded6"/>'+svg+'</svg>';return wrap;
  }

  /* ======================= shell ======================= */
  function show(tab) {
    saveMeta();
    app.screen = tab;
    var root = document.getElementById('app');
    root.innerHTML = '';
    var header = e('header', 'hd');
    var brand=e('button','brand');brand.type='button';brand.innerHTML='<svg viewBox="0 0 44 32" aria-hidden="true"><path d="M1 29L17 8l6 8 6-14 14 27z" fill="currentColor"/><path d="M12 19l5-7 6 8 6-13 6 12-6-6-5 12-7-8z" fill="white"/></svg><span>La Guitarra</span>';
    brand.onclick=function(){show(0);};header.appendChild(brand);
    var context=e('div','header-context');t(context,shortDate(meta().fecha),12,MUTED,false);
    var u=e('button','profile-link');u.type='button';u.textContent=app.user || 'Perfiles';u.title=profileLabel();u.onclick=function(){profiles();};context.appendChild(u);header.appendChild(context);
    root.appendChild(header);
    var main = e('main', 'body'); root.appendChild(main);
    dom.body = main; main.dataset.screen=String(tab);
    if(tab===1) heading(main,'Captura del turno','Registra las horas y condiciones de cada equipo');
    if(tab===2) heading(main,'Nuestros equipos','Catálogo y estado de la flota');
    if(tab===3) heading(main,'Reportes del turno','Tu operación, en un solo lugar');
    if (tab === 0) dashboard();
    else if (tab === 1) { turnCard(); equipment(); }
    else if (tab === 2) equipment();
    else reports();
    var nav = e('nav', 'tabs');
    var names = ['Inicio', 'Captura', 'Equipos', 'Reportes'];
    for (var i = 0; i < 4; i++) {
      (function (n) {
        var b = e('button', 'tab' + (tab === n ? ' active' : '')); b.type = 'button';
        b.style.color = tab === n ? GREEN : MUTED; b.setAttribute('aria-current',tab===n?'page':'false');
        b.appendChild(navIcon(n));
        var l = t(b, names[n], 11, tab === n ? GREEN : MUTED, true); l.classList.add('tab-label');
        b.onclick = function () { show(n); };
        nav.appendChild(b);
      })(i);
    }
    root.appendChild(nav);
    window.scrollTo(0,0);
  }

  /* ======================= Dashboard ======================= */
  function dashboard() {
    var t0 = totals(), counts = fleetCounts();
    var available = U.ratio(t0[0] - t0[2] - t0[3], t0[0]), util = U.ratio(t0[1], t0[0]);
    var top=row(dom.body,'summary-heading');heading(top,'Resumen del turno');var shift=t(top,(/noche/i.test(meta().turno)?'☾  ':'☀  ')+meta().turno,12,GREEN,true);shift.className+=' shift-chip';
    var grid=e('div','dashboard-grid');dom.body.appendChild(grid);
    var hero=card(grid);hero.classList.add('availability-hero');t(hero,'Disponibilidad',18,'#FFFFFF',true);t(hero,U.pct(available),54,'#FFFFFF',true).classList.add('hero-value');
    var heroFoot=row(hero);t(hero,'Disponibilidad mecánica del turno',12,'#d9ebe4',false);t(hero,t0[5]+' capturas KPI completas',12,'#d9ebe4',false);
    var metrics=row(grid,'metric-row dashboard-metrics');metricInto(metrics,'Utilización',U.pct(util),'Trabajo / horas del periodo',GREEN,util);metricInto(metrics,'Capturados',t0[5]+'/'+t0[6],t0[7]+' pendientes',GREEN,U.ratio(t0[5],t0[6]));
    var fleet=card(grid);fleet.classList.add('fleet-panel');t(fleet,'Estado de la flota · '+app.records.length+' equipos',17,INK,true);fleet.appendChild(barChart(counts));stateLegend(fleet,counts);
    var families=card(grid);families.classList.add('family-panel');t(families,'Horas por familia',17,INK,true);t(families,'Trabajo registrado · '+meta().turno,12,MUTED,false);
    var sums={};app.records.forEach(function(o){var k=LG.kpi.calc(o);var f=opt(o.familia)||'OTROS';if(!Object.prototype.hasOwnProperty.call(sums,f))sums[f]=0;if(o.kpi!==false&&k.completo)sums[f]+=k.trabajo;});var max=Math.max.apply(null,Object.keys(sums).map(function(k){return sums[k];}).concat([1]));
    Object.keys(sums).forEach(function(f){var line=e('div','family-hours');t(line,f.toLocaleLowerCase('es-MX'),11,MUTED,false);var bar=e('div','bar');var fill=e('div','bar-fill');fill.style.width=(sums[f]/max*100)+'%';bar.appendChild(fill);line.appendChild(bar);t(line,U.num(sums[f])+' h',12,INK,true);families.appendChild(line);});
    var cta=btn(grid,'Continuar captura · '+t0[7]+' pendientes  →',true,function(){show(1);},'capture-cta');cta.prepend(navIcon(1));
    var fuel=card(grid);fuel.classList.add('fuel-panel');t(fuel,'Diésel del turno',14,MUTED,false);t(fuel,U.num(LG.diesel.gallons(meta().diesel))+' gal',25,INK,true);t(fuel,'Carga registrada',12,MUTED,false);
    var actions=expandable(dom.body,'Más acciones del turno',false);btn(actions,'Pendientes por equipo',false,function(){pending();});btn(actions,'Comparativo diario / semanal / mensual',false,function(){comparison();});btn(actions,'Órdenes y calendario preventivo',false,function(){workOrders();});
    var saved=e('div','saved-note');saved.appendChild(navIcon(1));t(saved,'Guardado en este dispositivo · Disponible sin conexión',12,GREEN,false);dom.body.appendChild(saved);
  }

  /* ======================= Captura ======================= */
  function turnCard() {
    var details=e('details','turn-details');var summary=e('summary');summary.textContent=shortDate(meta().fecha)+' · '+meta().turno+' · Datos del turno';details.appendChild(summary);dom.body.appendChild(details);
    var c = card(details);
    t(c, 'Datos del turno', 18, INK, true);
    var date = dateField(c, 'Fecha', meta().fecha);
    var shift = field(c, 'Turno', meta().turno || 'D\u00eda', false);
    if (hasCapture()) shift.readOnly = true;
    var diesel = field(c, 'Di\u00e9sel del turno (gal o L)', meta().diesel, false);
    var supervisor = field(c, 'Supervisor', meta().supervisor, false);

    if (!app.user) { date.disabled = true; shift.disabled = true; diesel.disabled = true; supervisor.disabled = true; }
    function changeDate() {
      if (hasCapture()) { date.value = meta().fecha; toast('Usa Nuevo turno o Historial para cambiar la fecha sin mezclar capturas'); return; }
      app.meta.fecha = date.value; saveMeta();
    }
    date.onchange = changeDate;
    date.oninput = changeDate;
    shift.oninput = function () { app.meta.turno = shift.value; saveMeta(); };
    supervisor.oninput = function () { app.meta.supervisor = supervisor.value; saveMeta(); };
    diesel.oninput = function () { app.meta.diesel = diesel.value; saveMeta(); };

    var actions = row(c);
    btn(actions, 'Guardar turno', true, function () { archive(); });
    btn(actions, 'Nuevo turno', false, function () { newTurn(); });
  }

  function archive() {
    if (!canSupervise()) return;
    saveMeta();
    try {
      if (opt(app.meta.supervisor).trim() === '') throw new Error('Escribe el supervisor del turno');
      if (!U.validDate(opt(app.meta.fecha))) throw new Error('Fecha inv\u00e1lida');
      if (opt(app.meta.turno).trim() === '') throw new Error('Escribe el turno');
      if (app.signature !== '') {
        var info = findSignature();
        if (info && opt(info.turnKey) !== key()) app.signature = '';
      }
    } catch (err) { error(err); return; }
    S.archive(app.records, meta()).then(function () { return saveRecords(); })
      .then(function () { return Sync.enqueue(app.records, meta(), { user: app.user, role: app.role }); })
      .then(function () { toast('Turno guardado. Sincronización pendiente: ' + Sync.queue().length + ' equipos'); })
      .catch(error);
  }

  function newTurn() {
    if (!canSupervise()) return;
    saveMeta();
    var m = openModal('Nuevo turno');
    var date = dateField(m.content, 'Fecha (AAAA-MM-DD)', U.today());
    var shift = field(m.content, 'Turno', 'D\u00eda', false);
    t(m.content, 'Se guardar\u00e1 el turno actual en el historial y se iniciar\u00e1 una captura limpia. Se conservan los equipos y los hor\u00f3metros finales pasan a iniciales.', 13, MUTED, false);
    btn(m.content, 'Guardar actual e iniciar turno', true, function () {
      try {
        var nd = date.value, ns = opt(shift.value).trim();
        if (!U.validDate(nd)) throw new Error('Fecha inv\u00e1lida');
        if (ns === '') throw new Error('Escribe el turno');
        if (S.turnKey(nd, ns) === key()) throw new Error('Elige una fecha o turno diferente');
        var history = S.rows('turns');
        for (var i = 0; i < history.length; i++) if (history[i].key === S.turnKey(nd, ns)) throw new Error('Ese turno ya existe: \u00e1brelo desde Historial');
      } catch (err) { error(err); return; }
      S.archive(app.records, meta()).then(function () {
        for (var i = 0; i < app.records.length; i++) {
          var o = app.records[i], last = opt(o.final);
          var clear = ['final', 'mp', 'mc', 'percInicio', 'percFinal', 'hidraulico', 'motor', 'transmision',
            'dieselEquipo', 'personal', 'observaciones', 'capturadoPor', 'actualizado'];
          for (var j = 0; j < clear.length; j++) o[clear[j]] = '';
          if (last !== '') o.inicio = last;
          o.estado = 'POR CAPTURAR';
        }
        app.meta.fecha = nd; app.meta.turno = ns; app.meta.diesel = '';
        app.signature = ''; app.signatureTurn = S.turnKey(nd, ns);
        return saveRecords();
      }).then(function () { m.close(); show(1); }).catch(error);
    });
  }

  /* ======================= Equipos ======================= */
  function refreshList() {
    if (!eq.list) return;
    eq.list.innerHTML = '';
    var query = opt(eq.search.value).trim().toLowerCase();
    var found = 0;
    for (var i = 0; i < app.records.length; i++) {
      var o = app.records[i] || {};
      var hay = (opt(o.equipo) + ' ' + opt(o.eco) + ' ' + opt(o.marca) + ' ' + opt(o.departamento)).toLowerCase();
      if (query !== '' && hay.indexOf(query) < 0) continue;
      if(eq.capture==='pending' && captured(o))continue;
      if(eq.capture==='done' && !captured(o))continue;
      if (eq.family.selectedIndex > 0 && opt(o.familia) !== eq.family.value) continue;
      if (eq.state.selectedIndex > 0 && opt(o.estado) !== eq.state.value) continue;
      if (eq.kpi.selectedIndex === 1 && o.kpi === false) continue;
      if (eq.kpi.selectedIndex === 2 && o.kpi !== false) continue;
      if (eq.dept.selectedIndex > 0 && opt(o.departamento) !== eq.dept.value) continue;
      found++;
      renderItem(eq.list, i, o);
    }
    eq.summary.textContent = found + ' equipos \u00b7 ' + app.records.length + ' en el cat\u00e1logo';
    if (found === 0) t(eq.list, 'No se encontraron equipos con estos filtros.', 16, MUTED, false);
  }

  function renderItem(parent, index, o) {
    var item=card(parent);item.classList.add('equipment-card');item.appendChild(machine(o));
    var info=e('div','equipment-info');item.appendChild(info);t(info,opt(o.equipo)+(opt(o.eco)===''?'':' #'+opt(o.eco)),16,INK,true);t(info,opt(o.marca)+' · '+opt(o.familia).toLocaleLowerCase('es-MX'),11,MUTED,false);
    var done=captured(o),status=opt(o.estado)||'POR CAPTURAR';var badge=t(info,app.screen===1?(done?'✓  Capturado':'◷  Pendiente'):status.replace(/_/g,' '),11,done?GREEN:statusColor(status),true);badge.classList.add('status-pill',app.screen===1?(done?'is-done':'is-pending'):(status==='DISPONIBLE'?'is-done':'is-pending'));
    var k=LG.kpi.calc(o);if(k.completo&&o.kpi!==false)t(info,U.num(k.trabajo)+' h trabajadas',11,MUTED,false);
    var open=btn(item,app.screen===1?'Capturar':'Ver equipo',false,function(){edit(index);},'equipment-open');open.setAttribute('aria-label',(app.screen===1?'Capturar ':'Ver ')+opt(o.equipo)+' #'+opt(o.eco));var arrow=e('span');arrow.textContent='›';open.prepend(arrow);
    if (app.screen === 2 && canAdmin()) {
      var actions = row(item);
      btn(actions, 'Orden de trabajo', false, function () { order(index); });
      var remove = btn(actions, 'Eliminar', false, function () {
        alertDialog({
          title: 'Eliminar equipo', message: opt(o.equipo), positive: 'Eliminar', negative: 'Cancelar',
          onPositive: function () { app.records.splice(index, 1); saveRecords(); refreshList(); }
        });
      });
      remove.style.color = CHART[2];
    }
  }

  function equipment() {
    var all=app.records.length,complete=app.records.filter(captured).length;
    if(app.screen===1){var progress=e('div','capture-progress');t(progress,complete+' de '+all+' equipos registrados',14,MUTED,false);var line=row(progress);var bar=e('div','bar');var fill=e('div','bar-fill');fill.style.width=(all?complete/all*100:0)+'%';bar.appendChild(fill);line.appendChild(bar);t(line,(all?Math.round(complete/all*100):0)+'%',13,INK,true);dom.body.appendChild(progress);}
    var control = card(dom.body);control.classList.add('equipment-controls');
    var search = field(control, 'Buscar equipo, econ\u00f3mico o departamento', '', false);

    search.placeholder='Buscar equipo o económico';search.setAttribute('aria-label','Buscar equipo o económico');
    var filters=e('details','advanced-filters');var filtersTitle=e('summary');filtersTitle.textContent='Familia y filtros';filters.appendChild(filtersTitle);control.appendChild(filters);
    var families = ['Todas las familias'];
    for (var i = 0; i < app.records.length; i++) {
      var f = opt(app.records[i].familia);
      if (families.indexOf(f) < 0) families.push(f);
    }
    var family = spinner(filters, 'Familia', families, families[0]);
    family.onchange = refreshList;

    var extra = e('div'); extra.style.display = 'none'; filters.appendChild(extra);
    var toggle = t(filters, 'Filtros: estado, KPI y departamento', 12, GREEN, true); toggle.classList.add('link');
    var caret = e('span', 'caret'); caret.textContent = '\u25b8'; toggle.appendChild(caret);
    toggle.onclick = function () {
      extra.style.display = extra.style.display === 'none' ? 'block' : 'none';
      caret.textContent = extra.style.display === 'none' ? '\u25b8' : '\u25be';
    };

    var state = spinner(extra, 'Estado', FILTER_STATES, FILTER_STATES[0]); state.onchange = refreshList;
    var kpi = spinner(extra, 'Indicadores', FILTER_KPI, FILTER_KPI[0]); kpi.onchange = refreshList;
    var departments = ['Todos los departamentos'];
    for (var j = 0; j < app.records.length; j++) {
      var d = opt(app.records[j].departamento);
      if (d !== '' && departments.indexOf(d) < 0) departments.push(d);
    }
    var dept = spinner(extra, 'Departamento', departments, departments[0]); dept.onchange = refreshList;

    if (app.screen === 2 && canAdmin()) btn(control, '+ Agregar equipo', true, function () { edit(-1); });
    var summary = t(control, '', 12, MUTED, false);

    eq = { search: search, family: family, state: state, kpi: kpi, dept: dept, summary: summary, list: e('div', 'list') };
    eq.capture='all';
    if(app.screen===1){var chips=e('div','capture-filters');[['Pendientes','pending',all-complete],['Capturados','done',complete],['Todos','all',all]].forEach(function(v){var b=btn(chips,v[0]+'  '+v[2],false,function(){eq.capture=v[1];Array.from(chips.children).forEach(function(el){el.classList.remove('selected');el.setAttribute('aria-pressed','false');});b.classList.add('selected');b.setAttribute('aria-pressed','true');refreshList();});b.setAttribute('aria-pressed',v[1]==='all'?'true':'false');if(v[1]==='all')b.classList.add('selected');});dom.body.appendChild(chips);}
    dom.body.appendChild(eq.list);
    search.oninput = refreshList;
    refreshList();
  }

  /* ======================= editor de equipo ======================= */
  function edit(index) {
    if (!canCapture()) return;
    var source = index < 0 ? {} : app.records[index];
    try { source = JSON.parse(JSON.stringify(source)); } catch (er) { source = {}; }
    var draftKey = 'lg:draft-' + key() + '-' + (index < 0 ? 'new' : opt(source.id));
    var draft = '';
    try { draft = localStorage.getItem(draftKey) || ''; } catch (er) { draft = ''; }
    var hadDraft = draft !== '';
    if (hadDraft) { try { source = JSON.parse(draft); } catch (er) { } }

    source.equipo = S.equipmentName(source.equipo);
    var m = openModal(index < 0 ? 'Agregar equipo' : 'Capturar equipo', { full: true });
    m.panel.classList.add('equipment-editor');
    var form = m.content;
    var fields = {};
    var keys = [];

    function addField(name, el) { fields[name] = el; keys.push(name); return el; }

    t(form, opt(source.equipo) + (opt(source.eco) === '' ? '' : ' #' + opt(source.eco)), 22, INK, true);
    t(form, meta().fecha + ' \u00b7 ' + (meta().turno || 'D\u00eda') + ' \u00b7 ' + opt(meta().supervisor), 12, MUTED, false);
    if (hadDraft) t(form, 'Borrador recuperado', 12, GREEN, true);

    var admin = canAdmin();
    var identification = expandable(form, 'Identificaci\u00f3n', index < 0);
    [['equipo', 'Equipo / modelo'], ['eco', 'N\u00famero econ\u00f3mico'], ['marca', 'Marca'],
    ['familia', 'Familia'], ['departamento', 'Departamento'], ['ubicacion', 'Ubicaci\u00f3n']].forEach(function (f) {
      var el = addField(f[0], field(identification, f[1], source[f[0]], false));
      el.disabled = !admin;
    });
    if (index < 0) fields.familia.value = 'OTROS';

    var status = spinner(form, 'Estado actual del equipo', STATES, opt(source.estado) || 'POR CAPTURAR');

    var includeWrap = e('label', 'check');
    var include = e('input'); include.type = 'checkbox'; include.checked = source.kpi !== false; include.disabled = !admin;
    includeWrap.appendChild(include);
    includeWrap.appendChild(document.createTextNode(' Incluir en indicadores horarios (KPI)'));
    identification.appendChild(includeWrap);

    var editorTabs=e('nav','editor-tabs');editorTabs.setAttribute('aria-label','Secciones de captura');form.appendChild(editorTabs);
    var hours = card(form);hours.classList.add('hours-section');
    t(hours, 'Horómetro eléctrico · KPI', 18, INK, true);
    var meterRow = row(hours);
    addField('inicio', pairField(meterRow, 'Hor\u00f3metro inicial (h)', source.inicio));
    addField('final', pairField(meterRow, 'Hor\u00f3metro final (h)', source.final));
    addField('programadas', field(hours, 'Horas del periodo', index < 0 && opt(source.programadas) === '' ? '12' : source.programadas, true));
    var maintenanceTitle=t(hours,'Mantenimiento del turno',16,INK,true);maintenanceTitle.classList.add('maintenance-anchor');
    var mcRow = row(hours);
    addField('mp', pairField(mcRow, 'Mantenimiento preventivo MP (h)', source.mp));
    addField('mc', pairField(mcRow, 'Mantenimiento correctivo MC (h)', source.mc));
    var live = t(hours, '', 12, GREEN, true);live.classList.add('live-hours');live.setAttribute('aria-live','polite');
    var workBanner=e('div','work-banner');hours.insertBefore(workBanner,maintenanceTitle);t(workBanner,'Horas trabajadas',14,GREEN,true);var workValue=t(workBanner,'— h',26,GREEN,true);

    var periodLabel=hours.querySelector('label[for="'+fields.programadas.id+'"]');
    hours.insertBefore(periodLabel,live);hours.insertBefore(fields.programadas,live);
    var numbers = ['inicio', 'final', 'programadas', 'mp', 'mc'];
    function update() {
      var o = {};
      for (var i = 0; i < numbers.length; i++) o[numbers[i]] = fields[numbers[i]].value;
      var k = LG.kpi.calc(o);
      var txt = 'Trabajadas: ' + U.num(k.trabajo) + ' h   Espera: ' + U.num(k.espera) + ' h\n' +
        'Disponibilidad: ' + U.pct(k.disponibilidad) + '\n' +
        'Utilizaci\u00f3n: ' + U.pct(k.utilizacion) + '   Uso de disponibilidad: ' + U.pct(k.uso);
      var warning = '';
      if (U.finite(k.inicial) && U.finite(k.fin) && k.fin < k.inicial) warning = 'El hor\u00f3metro final es menor al inicial';
      else if (U.finite(k.periodo) && k.periodo <= 0) warning = 'El periodo debe ser mayor que cero';
      live.textContent = warning === '' ? txt : txt + '\n' + warning;
      workValue.textContent=U.num(k.trabajo)+' h';workBanner.classList.toggle('invalid',warning!=='');
      live.style.color = warning === '' ? GREEN : CHART[2];
    }

    var supplies = expandable(form, 'Percusi\u00f3n y suministros', false);
    var observations = card(form);
    [['Horómetros',hours],['Mantto.',maintenanceTitle],['Suministros',supplies]].forEach(function(v,i){var b=btn(editorTabs,v[0],false,function(){Array.from(editorTabs.children).forEach(function(el){el.classList.remove('selected');});b.classList.add('selected');if(v[1]===supplies)supplies.querySelector('.expand').style.display='block';v[1].scrollIntoView({behavior:'smooth',block:'start'});});if(i===0)b.classList.add('selected');});
    t(observations, 'Personal y observaciones', 18, INK, true);
    [['percInicio', 'Percusi\u00f3n inicial', supplies], ['percFinal', 'Percusi\u00f3n final', supplies],
    ['hidraulico', 'Aceite hidr\u00e1ulico (cantidad y unidad)', supplies], ['motor', 'Aceite motor (cantidad y unidad)', supplies],
    ['transmision', 'Transmisi\u00f3n (cantidad y unidad)', supplies], ['dieselEquipo', 'Di\u00e9sel por equipo (gal o L; sin unidad = gal)', supplies],
    ['personal', 'Personal que interviene', observations], ['observaciones', 'Observaciones / mantenimiento', observations]
    ].forEach(function (f) { addField(f[0], field(f[2], f[1], source[f[0]], false)); });

    btn(form, 'Adjuntar fotos / revisar evidencias', false, function () {
      if (index < 0) { toast('Guarda el equipo antes de adjuntar fotos'); return; }
      m.close(); photos(index);
    });
    form.appendChild(identification.parentNode);
    t(form, 'Puedes guardar una captura pendiente y completarla despu\u00e9s.', 12, MUTED, false);

    function saveDraft() {
      try {
        var item = JSON.parse(JSON.stringify(source));
        for (var k2 = 0; k2 < keys.length; k2++) item[keys[k2]] = fields[keys[k2]].value;
        item.estado = status.value;
        item.kpi = include.checked;
        localStorage.setItem(draftKey, JSON.stringify(item));
      } catch (er) { }
    }
    for (var fk = 0; fk < keys.length; fk++) {
      fields[keys[fk]].oninput = function(){saveDraft();update();};
    }
    status.onchange = saveDraft;
    include.onchange = function () { hours.style.display = include.checked ? 'block' : 'none'; saveDraft(); };
    hours.style.display = include.checked ? 'block' : 'none';
    update();

    var saveBar = e('div', 'modal-actions'); form.appendChild(saveBar);
    btn(saveBar, 'Guardar borrador', false, function () { saveDraft();m.close();toast('Borrador guardado en este dispositivo'); });
    btn(saveBar, 'Guardar', true, function () {
      var item = JSON.parse(JSON.stringify(source));
      for (var k2 = 0; k2 < keys.length; k2++) item[keys[k2]] = opt(fields[keys[k2]].value).trim();
      if (opt(item.equipo) === '') { toast('Escribe el nombre del equipo'); return; }
      if (opt(item.familia) === '') item.familia = 'OTROS';
      item.kpi = include.checked;
      item.estado = status.value;
      item.capturadoPor = profileLabel();
      item.actualizado = Date.now();
      if (include.checked) {
        for (var i = 0; i < numbers.length; i++) {
          var val = opt(item[numbers[i]]);
          var num = U.value(item, numbers[i]);
          if (val !== '' && (!U.finite(num) || num < 0)) { toast('Introduce un n\u00famero v\u00e1lido mayor o igual a cero'); return; }
        }
        var p = U.value(item, 'programadas'), hi = U.value(item, 'inicio'), hf = U.value(item, 'final'),
          mp = U.value(item, 'mp'), mc = U.value(item, 'mc');
        if (U.finite(p) && p <= 0) { toast('El periodo debe ser mayor que cero'); return; }
        if (U.finite(hi) && U.finite(hf) && hf < hi) { toast('El final no puede ser menor al inicial'); return; }
        if (U.finite(p) && ((U.finite(mp) && mp > p) || (U.finite(mc) && mc > p) || (U.finite(mp) && U.finite(mc) && mp + mc > p))) {
          toast('El mantenimiento no debe superar el periodo'); return;
        }
        if (U.finite(p) && U.finite(hi) && U.finite(hf) && (hf - hi) + (U.finite(mp) ? mp : 0) + (U.finite(mc) ? mc : 0) > p + 0.000001) {
          toast('Trabajo m\u00e1s mantenimiento supera el periodo'); return;
        }
      }
      if (index < 0) { item.id = 'equipo-' + U.uuid(); app.records.push(item); }
      else app.records[index] = item;
      saveRecords().then(function () {
        try { localStorage.removeItem(draftKey); } catch (er) { }
        m.close();
        if (app.screen === 1 || app.screen === 2) refreshList(); else show(app.screen);
        afterCapture(item);
        toast('Equipo guardado');
      }, function () { toast('No se pudo guardar la captura'); });
    });

    update();
  }

  function afterCapture(item) {
    var state = opt(item.estado);
    if (state !== 'FUERA DE SERVICIO' && state !== 'NO DISPONIBLE') return;
    var orders = S.rows('orders');
    for (var i = 0; i < orders.length; i++) {
      if (opt(orders[i].equipmentId) === opt(item.id) && opt(orders[i].status) !== 'CERRADA') return;
    }
    alertDialog({
      title: 'Equipo fuera de servicio', message: '\u00bfQuieres registrar una orden de trabajo?',
      positive: 'Crear orden', negative: 'Despu\u00e9s',
      onPositive: function () {
        var idx = -1;
        for (var j = 0; j < app.records.length; j++) if (opt(app.records[j].id) === opt(item.id)) { idx = j; break; }
        if (idx >= 0) order(idx);
      }
    });
  }

  /* ======================= Reportes ======================= */
  function reports() {
    executive(dom.body);
    var output = card(dom.body);
    t(output, 'Entrega del turno', 20, INK, true);
    t(output, meta().fecha + ' \u00b7 ' + (meta().turno || 'D\u00eda') + '\nSupervisor: ' + fallback(meta().supervisor), 13, MUTED, false);
    t(output, 'Reporte de 2 hojas: registro de equipos y tablero KPI con di\u00e9sel.', 13, MUTED, false);
    btn(output, 'Vista previa', false, function () { preview(); });
    btn(output, 'PDF por WhatsApp', true, function () { exportCurrent(true, true); });
    btn(output, 'PNG por WhatsApp', true, function () { exportCurrent(false, true); });
    var save = row(output);
    btn(save, 'Guardar PDF', false, function () { exportCurrent(true, false); });
    btn(save, 'Guardar PNG', false, function () { exportCurrent(false, false); });
    btn(output, 'Exportar Excel / CSV', false, function () { csvDialog(); });
    btn(output, 'Fotos y firma del turno', false, function () { evidence(); });

    var syncCard = card(dom.body);
    t(syncCard, 'Sincronización de supervisión', 19, INK, true);
    t(syncCard, 'Envía al portal las horas, disponibilidad y utilización de cada equipo por supervisor.', 12, MUTED, false);
    t(syncCard, Sync.queue().length ? Sync.queue().length + ' captura(s) pendientes en este dispositivo.' : 'Sin capturas pendientes de envío.', 12, Sync.queue().length ? '#B67513' : GREEN, false);
    if (canAdmin()) btn(syncCard, 'Configurar portal', false, function () { syncSettings(); });
    btn(syncCard, 'Sincronizar ahora', true, function () { syncNow(); });

    var history = card(dom.body);
    t(history, 'Historial y respaldo', 19, INK, true);
    btn(history, 'Turnos guardados', false, function () { historyDialog(); });
    btn(history, 'Comparar KPI por periodo', false, function () { comparison(); });
    btn(history, 'Respaldar datos', false, function () { backup(); });
    if (canAdmin()) btn(history, 'Importar respaldo', false, function () { importBackup(); });
    t(history, 'El respaldo incluye historial, equipos, fotos, firmas, \u00f3rdenes y preventivos.', 12, MUTED, false);
  }

  function syncSettings() {
    var m = openModal('Configuración del portal');
    t(m.content, 'La URL y la clave se guardan únicamente en este dispositivo. No se incluyen en reportes ni respaldos.', 13, MUTED, false);
    var current = Sync.config();
    var url = field(m.content, 'URL del portal', current.url || Sync.defaultUrl, false);
    var apiKey = field(m.content, 'Clave de publicación del portal', current.key, false); apiKey.type = 'password';
    btn(m.content, 'Guardar configuración', true, function () {
      var cleanUrl = opt(url.value).trim().replace(/\/$/, ''), cleanKey = opt(apiKey.value).trim();
      if (!/^https:\/\//i.test(cleanUrl) || cleanKey.length < 16) { toast('Revisa la URL y la clave del portal'); return; }
      Promise.all([S.set('portal-api-url', cleanUrl), S.set('portal-api-key', cleanKey)]).then(function () { m.close(); toast('Configuración local guardada'); }).catch(error);
    });
  }

  function syncNow() {
    if (!Sync.configured()) { if (canAdmin()) syncSettings(); else toast('Pide a un administrador configurar el portal'); return; }
    var loading = busyOverlay('Sincronizando supervisión…');
    Sync.publish().then(function (result) { loading.remove(); toast(result.count ? result.count + ' captura(s) sincronizadas' : 'No hay capturas pendientes'); show(3); }).catch(function (err) { loading.remove(); error(err); });
  }

  function executive(parent) {
    var c = card(parent);
    t(c, 'Resumen ejecutivo', 19, INK, true);
    var t0 = totals(), counts = fleetCounts();
    var head = row(c, 'exec-head');
    head.appendChild(donut(counts, U.pct(U.ratio(t0[0] - t0[2] - t0[3], t0[0]))));
    var legend = e('div', 'legend-col'); head.appendChild(legend);
    stateLegend(legend, counts);
    t(c, 'KPI por familia', 15, INK, true);
    var names = [];
    for (var i = 0; i < app.records.length; i++) { var f = opt(app.records[i].familia); if (names.indexOf(f) < 0) names.push(f); }
    for (var n = 0; n < names.length; n++) {
      var period = 0, work = 0, repair = 0, pendingN = 0;
      for (var j = 0; j < app.records.length; j++) {
        var o = app.records[j];
        if (opt(o.familia) !== names[n] || o.kpi === false) continue;
        var k = LG.kpi.calc(o);
        if (k.completo) { period += k.periodo; work += k.trabajo; repair += k.mp + k.mc; } else pendingN++;
      }
      t(c, names[n], 12, MUTED, true);
      t(c, 'D ' + U.pct(U.ratio(period - repair, period)) + '   U ' + U.pct(U.ratio(work, period)) + '   Pend. ' + pendingN, 14, INK, true);
    }
  }

  /* ======================= reporte PDF / PNG ======================= */
  function loadSignature(name) {
    if (!name || !/^[a-zA-Z0-9-]+\.(png|jpg)$/.test(name)) return Promise.resolve(null);
    return S.getMedia(name).then(function (blob) { return blob ? M.loadBlob(blob) : null; }, function () { return null; });
  }

  function annotatePhotos(records, turn) {
    var ev = S.rows('evidence');
    for (var i = 0; i < records.length; i++) {
      var o = records[i], count = 0;
      for (var j = 0; j < ev.length; j++) {
        if (opt(ev[j].turnKey) === turn && opt(ev[j].equipmentId) === opt(o.id) && opt(ev[j].kind) === 'photo') count++;
      }
      if (count > 0) o.observaciones = opt(o.observaciones) + '\nEvidencias: ' + count + ' foto(s), disponibles en el archivo de evidencias del turno.';
    }
  }

  function reportFor(records, metaObj, turnKeyVal) {
    var copy = JSON.parse(JSON.stringify(records));
    annotatePhotos(copy, turnKeyVal);
    return loadSignature(metaObj.signature).then(function (sig) {
      return new LG.reportDoc.Report(copy, {
        logo: app.logo, date: metaObj.fecha, supervisor: metaObj.supervisor,
        shift: metaObj.turno, diesel: metaObj.diesel, signature: sig
      });
    });
  }

  function deliverReport(rep, pdf, whatsapp, metaObj) {
    var date = metaObj.fecha || U.today();
    var folder = 'La-Guitarra-' + date + '-' + U.uuid();
    if (pdf) {
      var blob = new Blob([rep.pdf()], { type: 'application/pdf' });
      if (whatsapp) {
        return R.share(blob, folder + '.pdf').then(function (ok) {
          if (!ok) R.download(blob, 'La-Guitarra-' + date + '.pdf');
          toast('Reporte PDF generado');
        });
      }
      R.download(blob, 'La-Guitarra-' + date + '.pdf');
      toast('Reporte PDF generado');
      return Promise.resolve();
    }
    return M.canvasBlob(rep.png(), 'image/png').then(function (blob) {
      if (whatsapp) {
        return R.share(blob, folder + '.png').then(function (ok) {
          if (!ok) R.download(blob, 'La-Guitarra-' + date + '.png');
          toast('Reporte PNG generado');
        });
      }
      R.download(blob, 'La-Guitarra-' + date + '.png');
      toast('Reporte PNG generado');
    });
  }

  function exportCurrent(pdf, whatsapp) {
    saveMeta();
    if (app.records.length === 0) { toast('Agrega al menos un equipo'); return; }
    if (opt(meta().supervisor).trim() === '') { toast('Captura el supervisor en Captura'); show(1); return; }
    if (app.records.length > 200) { toast('El reporte admite hasta 200 equipos'); return; }
    if (!U.validDate(opt(meta().fecha))) { toast('Revisa la fecha del reporte'); show(1); return; }
    var busy = busyOverlay('Generando reporte\u2026');
    reportFor(app.records, meta(), key()).then(function (rep) {
      return deliverReport(rep, pdf, whatsapp, meta());
    }).then(function () { busy.remove(); }, function () { busy.remove(); toast('No fue posible generar el archivo. Intenta exportar en PDF.'); });
  }

  function preview() {
    var busy = busyOverlay('Generando vista previa\u2026');
    reportFor(app.records, meta(), key()).then(function (rep) {
      var pages = rep.pages();
      var m = openModal('Vista previa');
      t(m.content, pages.length + ' hojas \u00b7 registro completo y tablero de KPI', 14, INK, true);
      for (var i = 0; i < pages.length; i++) {
        var full = rep.render(pages[i]);
        var w = 1200, h = Math.round(1200 * pages[i].height / pages[i].width);
        var canvas = e('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(full, 0, 0, w, h);
        var img = e('img', 'preview-img'); img.src = canvas.toDataURL('image/png');
        m.content.appendChild(img);
      }
      busy.remove();
    }, function () { busy.remove(); toast('No se pudo abrir la vista previa'); });
  }

  /* ======================= CSV / Excel ======================= */
  function csvDialog() {
    var m = openModal('Exportar Excel / CSV');
    t(m.content, meta().fecha + ' \u00b7 ' + (meta().turno || 'D\u00eda') + '\nSupervisor: ' + fallback(meta().supervisor), 13, MUTED, false);
    t(m.content, app.records.length + ' equipos \u00b7 CSV id\u00e9ntico al APK y libro Excel con hojas adicionales.', 13, MUTED, false);
    btn(m.content, 'Descargar CSV', true, function () {
      try {
        R.download(new Blob([R.csvText(app.records, meta())], { type: 'text/csv;charset=utf-8' }),
          'La-Guitarra-' + meta().fecha + '.csv');
        toast('CSV generado');
      } catch (err) { error(err); }
    });
    btn(m.content, 'Descargar Excel (.xlsx)', false, function () {
      try {
        var root = S.root() || {};
        var bytes = R.xlsxBytes(app.records, meta(), {
          turns: root.turns, orders: root.orders, preventive: root.preventive, evidence: root.evidence
        });
        R.download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          'La-Guitarra-' + meta().fecha + '.xlsx');
        toast('Excel generado');
      } catch (err) { error(err); }
    });
  }

  /* ======================= perfiles ======================= */
  function profiles() {
    var users = S.rows('users', 'name');
    if (users.length === 0) { createProfile(true); return; }
    var m = openModal('Usuarios locales');
    t(m.content, 'Selecciona tu perfil e introduce su PIN.', 14, MUTED, false);
    users.forEach(function (p) {
      btn(m.content, p.name + ' \u00b7 ' + p.role, false, function () { m.close(); login(p); });
    });
    if (canAdmin()) btn(m.content, '+ Crear usuario', true, function () { m.close(); createProfile(false); });
  }

  function createProfile(first) {
    if (!first && !canAdmin()) return;
    var m = openModal('Crear perfil', { noClose: !!first });
    t(m.content, first ? 'Crea el administrador de este tel\u00e9fono.' : 'Nuevo perfil local', 14, MUTED, false);
    var name = field(m.content, 'Nombre', '', false);
    var pin = field(m.content, 'PIN (m\u00ednimo 6 d\u00edgitos)', '', true); pin.type = 'password';
    var confirm = field(m.content, 'Confirmar PIN', '', true); confirm.type = 'password';
    var roles = spinner(m.content, 'Rol', first ? ['Administrador'] : ['Supervisor', 'Mec\u00e1nico', 'Administrador'], first ? 'Administrador' : 'Supervisor');
    btn(m.content, 'Crear usuario', true, function () {
      var n = name.value.trim(), p = pin.value;
      if (n === '') { toast('Escribe un nombre'); return; }
      if (!/^[0-9]{6,}$/.test(p) || p !== confirm.value) { toast('Usa al menos 6 d\u00edgitos y confirma el mismo PIN'); return; }
      var all = S.rows('users');
      for (var i = 0; i < all.length; i++) {
        if (opt(all[i].name).toLowerCase() === n.toLowerCase()) { toast('Nombre ya registrado'); return; }
      }
      var salt = LG.pin.salt();
      LG.pin.hash(p, salt).then(function (hash) {
        return S.put('users', { id: U.uuid(), name: n, role: roles.value, salt: salt, hash: hash });
      }).then(function () {
        if (first) { app.user = n; app.role = 'Administrador'; }
        m.close(); show(app.screen);
      }).catch(error);
    });
  }

  function login(p) {
    var m = openModal('Iniciar sesi\u00f3n');
    var pin = field(m.content, 'PIN de ' + p.name, '', true); pin.type = 'password';
    var go = btn(m.content, 'Entrar', true, function () {
      LG.pin.verify(pin.value, p.salt, p.hash).then(function (ok) {
        if (!ok) { toast('PIN incorrecto'); return; }
        app.user = p.name; app.role = p.role; m.close(); show(app.screen);
      }, function () { toast('PIN incorrecto'); });
    });
    pin.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go.click(); } };
  }

  /* ======================= Historial ======================= */
  function historyDialog() {
    var turns = S.rows('turns', 'date DESC,shift');
    var m = openModal('Historial por fecha y turno');
    if (turns.length === 0) t(m.content, 'Guarda un turno desde Captura para comenzar el historial.', 14, MUTED, false);
    turns.forEach(function (turn) {
      var metaObj = {};
      try { metaObj = JSON.parse(turn.meta); } catch (er) { metaObj = {}; }
      var c = card(m.content);
      t(c, turn.date + ' \u00b7 ' + turn.shift, 17, INK, true);
      t(c, opt(metaObj.supervisor), 13, MUTED, false);
      btn(c, 'Ver resumen / reporte', false, function () { historicalReport(turn); });
      if (canAdmin() || app.role === 'Supervisor') {
        btn(c, 'Continuar captura de este turno', false, function () {
          alertDialog({
            title: 'Abrir turno', message: 'Se guardar\u00e1 la captura actual y se abrir\u00e1 este turno para editarlo.',
            positive: 'Abrir', negative: 'Cancelar', onPositive: function () { openTurn(turn); }
          });
        });
      }
    });
  }

  function openTurn(turn) {
    var metaObj = {};
    try { metaObj = JSON.parse(turn.meta); } catch (er) { metaObj = {}; }
    S.archive(app.records, meta()).then(function () {
      var data = [];
      try { data = JSON.parse(turn.data); } catch (er) { data = []; }
      app.records = data;
      applyMeta(metaObj);
      return saveRecords();
    }).then(function () { show(1); }).catch(error);
  }

  function historicalReport(turn) {
    var metaObj = {};
    try { metaObj = JSON.parse(turn.meta); } catch (er) { metaObj = {}; }
    var data = [];
    try { data = JSON.parse(turn.data); } catch (er) { data = []; }
    var m = openModal('Reporte hist\u00f3rico');
    t(m.content, 'Reporte guardado del ' + metaObj.fecha + ' \u00b7 ' + metaObj.turno, 16, INK, true);
    btn(m.content, 'PDF por WhatsApp', true, function () { exportTurn(data, metaObj, turn.key, true, true); });
    btn(m.content, 'PNG por WhatsApp', false, function () { exportTurn(data, metaObj, turn.key, false, true); });
    btn(m.content, 'Guardar PDF', false, function () { exportTurn(data, metaObj, turn.key, true, false); });
    btn(m.content, 'Guardar PNG', false, function () { exportTurn(data, metaObj, turn.key, false, false); });
  }

  function exportTurn(records, metaObj, turnKeyVal, pdf, whatsapp) {
    var busy = busyOverlay('Generando reporte\u2026');
    reportFor(records, metaObj, turnKeyVal).then(function (rep) {
      return deliverReport(rep, pdf, whatsapp, metaObj);
    }).then(function () { busy.remove(); }, function () { busy.remove(); toast('No fue posible generar el archivo. Intenta exportar en PDF.'); });
  }

  /* ======================= Comparativo ======================= */
  function comparison() {
    var turns = S.rows('turns', 'date DESC,shift');
    var m = openModal('Comparar KPI por periodo');
    var per = spinner(m.content, 'Agrupar', ['Diario', 'Semanal', 'Mensual'], 'Diario');
    var data = e('div'); m.content.appendChild(data);
    function render() {
      data.innerHTML = '';
      var sums = {};
      for (var i = 0; i < turns.length; i++) {
        var turn = turns[i], date = opt(turn.date), label = date;
        if (per.selectedIndex === 2) label = date.slice(0, 7);
        else if (per.selectedIndex === 1) label = 'Semana del ' + U.weekStart(date);
        if (!sums[label]) sums[label] = [0, 0, 0, 0, 0, 0, 0];
        var s = sums[label];
        var records = [];
        try { records = JSON.parse(turn.data); } catch (er) { records = []; }
        for (var j = 0; j < records.length; j++) {
          var o = records[j];
          if (o.kpi === false) continue;
          var k = LG.kpi.calc(o); s[5]++;
          if (k.completo) { s[0] += k.periodo; s[1] += k.trabajo; s[2] += k.mp + k.mc; s[4]++; }
        }
        var mm = {};
        try { mm = JSON.parse(turn.meta); } catch (er) { mm = {}; }
        var fuel = LG.diesel.gallons(opt(mm.diesel));
        if (U.finite(fuel)) { s[3] += fuel; s[6]++; }
      }
      var labels = Object.keys(sums).sort().reverse();
      if (labels.length === 0) t(data, 'A\u00fan no hay turnos guardados.', 14, MUTED, false);
      labels.forEach(function (label) {
        var v = sums[label], c = card(data);
        t(c, label, 16, INK, true);
        t(c, 'Disponibilidad ' + U.pct(U.ratio(v[0] - v[2], v[0])) + '\nUtilizaci\u00f3n ' + U.pct(U.ratio(v[1], v[0])) +
          '\nDi\u00e9sel ' + (v[6] > 0 ? U.num(v[3]) + ' gal' : '\u2014') +
          '\nCapturas completas ' + (v[4] | 0) + ' / ' + (v[5] | 0), 14, MUTED, false);
        var ratio = U.ratio(v[0] - v[2], v[0]);
        var bar = e('div', 'bar'); var fill = e('div', 'bar-fill');
        fill.style.width = (U.finite(ratio) ? Math.max(0, Math.min(1, ratio)) * 100 : 0) + '%';
        fill.style.background = GREEN; bar.appendChild(fill); c.appendChild(bar);
      });
    }
    per.onchange = render; render();
  }

  /* ======================= Pendientes ======================= */
  function isPending(o) {
    return (o.kpi !== false && !LG.kpi.calc(o).completo) || opt(o.estado) === 'POR CAPTURAR';
  }
  function pending() {
    var m = openModal('Pendientes por equipo');
    var count = 0;
    for (var i = 0; i < app.records.length; i++) {
      var o = app.records[i];
      if (!isPending(o)) continue;
      count++;
      (function (index, item) {
        var c = card(m.content);
        t(c, opt(item.equipo) + ' #' + opt(item.eco), 16, INK, true);
        var missing = '';
        ['inicio', 'final', 'programadas', 'mp', 'mc'].forEach(function (k) {
          if (item.kpi !== false && opt(item[k]) === '') missing += k + ' \u00b7 ';
        });
        t(c, 'Estado: ' + opt(item.estado) + '\nFalta: ' + (missing !== '' ? missing : 'revisar estado o coherencia de horas'), 12, MUTED, false);
        btn(c, 'Completar captura', true, function () { m.close(); edit(index); });
      })(i, o);
    }
    if (count === 0) t(m.content, 'No hay capturas pendientes.', 16, GREEN, true);
    else btn(m.content, 'PDF de pendientes por WhatsApp', true, function () { pendingReport(); });
  }

  function pendingReport() {
    var list = [];
    for (var i = 0; i < app.records.length; i++) if (isPending(app.records[i])) list.push(JSON.parse(JSON.stringify(app.records[i])));
    var metaObj = { fecha: meta().fecha, turno: meta().turno, supervisor: opt(meta().supervisor) + ' \u00b7 PENDIENTES', diesel: '', signature: '' };
    var busy = busyOverlay('Generando reporte\u2026');
    reportFor(list, metaObj, key()).then(function (rep) {
      return deliverReport(rep, true, true, metaObj);
    }).then(function () { busy.remove(); }, function () { busy.remove(); toast('No fue posible generar el archivo.'); });
  }

  /* ======================= Órdenes y preventivos ======================= */
  function workOrders() {
    var m = openModal('\u00d3rdenes y calendario preventivo');
    t(m.content, '\u00d3rdenes de trabajo', 19, INK, true);
    if (app.user) btn(m.content, '+ Nueva orden', true, function () { m.close(); chooseOrder(); });
    var orders = S.rows('orders', 'created DESC');
    if (orders.length === 0) t(m.content, 'Sin \u00f3rdenes. Crea una desde Equipos o al registrar un equipo fuera de servicio.', 13, MUTED, false);
    orders.forEach(function (o) {
      var c = card(m.content);
      t(c, opt(o.name), 16, INK, true);
      t(c, opt(o.status) + ' \u00b7 ' + opt(o.created) + '\n' + opt(o.description) + '\n' + opt(o.author), 13, MUTED, false);
      if (opt(o.status) !== 'CERRADA' && app.user) {
        btn(c, opt(o.status) === 'ABIERTA' ? 'Iniciar trabajo' : 'Cerrar orden', true, function () {
          var next = opt(o.status) === 'ABIERTA' ? 'EN PROCESO' : 'CERRADA';
          S.update('orders', o.id, 'status', next).then(function () {
            return next === 'EN PROCESO' ? S.update('orders', o.id, 'closed', U.today()) : null;
          }).then(function () {
            toast('Orden actualizada; el estado del equipo se captura por separado');
            m.close(); recreateWorkOrders();
          });
        });
      }
    });

    t(m.content, 'Calendario preventivo', 19, INK, true);
    if (canAdmin() || app.role === 'Supervisor') btn(m.content, '+ Programar preventivo', true, function () { m.close(); preventive(); });
    var tasks = S.rows('preventive', 'due ASC');
    if (tasks.length === 0) t(m.content, 'Sin preventivos programados.', 13, MUTED, false);
    tasks.forEach(function (o) {
      var c = card(m.content);
      var overdue = opt(o.due) < U.today() && opt(o.status) !== 'REALIZADO';
      t(c, opt(o.due) + (overdue ? ' \u00b7 VENCIDO' : ''), 16, overdue ? CHART[2] : GREEN, true);
      t(c, opt(o.name) + '\n' + opt(o.details) + '\n' + opt(o.status), 13, MUTED, false);
      if (opt(o.status) !== 'REALIZADO' && app.user) {
        btn(c, 'Marcar realizado', false, function () {
          S.update('preventive', o.id, 'status', 'REALIZADO').then(function () {
            toast('Preventivo registrado como realizado');
            m.close(); recreateWorkOrders();
          });
        });
      }
    });
  }
  function recreateWorkOrders() { workOrders(); }

  function chooseOrder() {
    if (app.records.length === 0) return;
    var m = openModal('Elegir equipo');
    app.records.forEach(function (o, i) {
      btn(m.content, opt(o.equipo) + ' #' + opt(o.eco) + ' \u00b7 ' + opt(o.marca), false, function () { m.close(); order(i); });
    });
  }

  function order(index) {
    if (!canCapture() || index < 0 || index >= app.records.length) return;
    var equipment = app.records[index];
    var m = openModal('Nueva orden de trabajo');
    t(m.content, opt(equipment.equipo) + ' #' + opt(equipment.eco), 18, INK, true);
    var description = field(m.content, 'Observaciones / trabajo requerido', equipment.observaciones, false);
    btn(m.content, 'Crear orden', true, function () {
      if (opt(description.value).trim() === '') { toast('Describe el trabajo'); return; }
      var o = {
        id: U.uuid(), equipmentId: opt(equipment.id),
        name: opt(equipment.equipo) + ' #' + opt(equipment.eco),
        status: 'ABIERTA', description: description.value, created: U.today(), closed: '', author: profileLabel()
      };
      S.put('orders', o).then(function () { m.close(); toast('Orden de trabajo creada'); }, error);
    });
  }

  function preventive() {
    if (!canSupervise()) return;
    if (app.records.length === 0) return;
    var m = openModal('Programar preventivo');
    var names = app.records.map(function (o) { return opt(o.equipo) + ' #' + opt(o.eco) + ' \u00b7 ' + opt(o.marca); });
    var equipment = spinner(m.content, 'Equipo', names, names[0]);
    var date = dateField(m.content, 'Fecha programada', U.today());
    var detail = field(m.content, 'Observaciones / tarea preventiva', '', false);
    btn(m.content, 'Programar', true, function () {
      if (!U.validDate(date.value)) { toast('Fecha inv\u00e1lida'); return; }
      if (opt(detail.value).trim() === '') { toast('Describe la tarea'); return; }
      var idx = equipment.selectedIndex;
      var o = {
        id: U.uuid(), equipmentId: opt(app.records[idx].id), name: names[idx],
        due: date.value, details: detail.value, status: 'PROGRAMADO'
      };
      S.put('preventive', o).then(function () { m.close(); toast('Preventivo programado'); }, error);
    });
  }

  /* ======================= Evidencias ======================= */
  function findSignature() {
    var all = S.rows('evidence');
    for (var i = 0; i < all.length; i++) if (opt(all[i].fileName) === app.signature) return all[i];
    return null;
  }

  function evidence() {
    var m = openModal('Evidencias del turno');
    var urls = [];
    m.onClose = function () { urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (er) { } }); };
    t(m.content, 'Firma del supervisor', 18, INK, true);
    var sigSlot = e('div'); m.content.appendChild(sigSlot);
    loadSignature(app.signature).then(function (img) {
      if (!img) return;
      img.className = 'sig-img'; sigSlot.appendChild(img);
      if (img._objectUrl) urls.push(img._objectUrl);
    });
    if (canAdmin() || app.role === 'Supervisor') btn(m.content, 'Registrar / reemplazar firma', true, function () { m.close(); sign(); });
    t(m.content, 'Fotos por equipo', 18, INK, true);
    app.records.forEach(function (o, index) {
      btn(m.content, opt(o.equipo) + ' #' + opt(o.eco) + ' \u00b7 ' + opt(o.marca), false, function () { m.close(); photos(index); });
    });
    btn(m.content, 'Exportar evidencias del turno', false, function () { evidenceZip(); });
  }

  function photos(index) {
    var o = app.records[index];
    if (!o) return;
    var id = opt(o.id);
    var m = openModal('Fotos del equipo');
    var urls = [];
    m.onClose = function () { urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (er) { } }); };
    t(m.content, opt(o.equipo) + ' \u00b7 ' + meta().fecha + ' \u00b7 ' + (meta().turno || 'D\u00eda'), 14, INK, true);
    if (app.user) {
      btn(m.content, 'Elegir foto', true, function () { m.close(); selectPhoto(index, false); });
      btn(m.content, 'Tomar foto', false, function () { m.close(); selectPhoto(index, true); });
    }
    var ev = S.rows('evidence');
    var count = 0;
    for (var i = 0; i < ev.length; i++) {
      if (opt(ev[i].turnKey) !== key() || opt(ev[i].equipmentId) !== opt(o.id) || opt(ev[i].kind) !== 'photo') continue;
      count++;
      (function (name) {
        loadSignature(name).then(function (img) {
          if (!img) return;
          if (!m.overlay.parentNode) { if (img._objectUrl) URL.revokeObjectURL(img._objectUrl); return; }
          img.className = 'photo'; m.content.appendChild(img);
          if (img._objectUrl) urls.push(img._objectUrl);
        });
      })(opt(ev[i].fileName));
    }
    if (count === 0) t(m.content, 'Sin fotos en este turno.', 13, MUTED, false);
  }

  function selectPhoto(index, camera) {
    if (!canCapture()) return;
    var equipment = app.records[index];
    if (!equipment) return;
    var equipmentId = opt(equipment.id);
    var input = e('input');
    input.type = 'file'; input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.remove();
      if (!file) return;
      addPhoto(file, equipmentId).then(function () {
        toast('Foto guardada');
        photos(index);
      }, error);
    };
    input.click();
  }

  function addPhoto(file, equipmentId) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        M.image(reader.result).then(function (img) {
          var max = 2000;
          var scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          var w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
          var h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
          var canvas = e('canvas'); canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          return M.canvasBlob(canvas, 'image/jpeg', 0.85);
        }).then(function (blob) {
          var name = U.uuid() + '.jpg';
          return S.putMedia(name, blob).then(function () {
            return S.put('evidence', { id: U.uuid(), turnKey: key(), equipmentId: opt(equipmentId), fileName: name, kind: 'photo' });
          });
        }).then(resolve, reject);
      };
      reader.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
      reader.readAsDataURL(file);
    });
  }

  function sign() {
    if (!canSupervise()) return;
    var m = openModal('Firma del turno');
    t(m.content, 'Firma para ' + meta().fecha + ' \u00b7 ' + (meta().turno || 'D\u00eda') + '\nSupervisor: ' + opt(meta().supervisor), 14, INK, true);
    var wrap = e('div', 'sig-wrap');
    var canvas = e('canvas', 'sig');
    canvas.width = 900; canvas.height = 300;
    wrap.appendChild(canvas); m.content.appendChild(wrap);
    var ctx = canvas.getContext('2d');
    function clear() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    clear();
    var marked = false, drawing = false, last = null;
    function pos(ev) {
      var r = canvas.getBoundingClientRect();
      var p = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
      return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
    }
    function down(ev) { ev.preventDefault(); drawing = true; marked = true; last = pos(ev); }
    function move(ev) {
      if (!drawing) return;
      ev.preventDefault();
      var p = pos(ev);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
      last = p;
    }
    function up() { drawing = false; }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    m.onClose = function () { window.removeEventListener('pointerup', up); };
    btn(m.content, 'Limpiar', false, function () { clear(); marked = false; });
    btn(m.content, 'Guardar firma', true, function () {
      if (!marked) { toast('Dibuja tu firma'); return; }
      M.canvasBlob(canvas, 'image/png').then(function (blob) {
        var name = U.uuid() + '.png';
        return S.putMedia(name, blob).then(function () {
          return S.put('evidence', { id: U.uuid(), turnKey: key(), equipmentId: '', fileName: name, kind: 'signature' });
        }).then(function () {
          app.signature = name; app.signatureTurn = key();
          return saveRecords();
        });
      }).then(function () { m.close(); toast('Firma guardada; se incluir\u00e1 en PDF y PNG'); }, error);
    });
  }

  function evidenceZip() {
    var busy = busyOverlay('Preparando evidencias\u2026');
    var all = S.rows('evidence');
    var current = key();
    var files = [], index = [], count = 0;
    var chain = Promise.resolve();
    for (var i = 0; i < all.length; i++) {
      var ev = all[i];
      if (opt(ev.turnKey) !== current) continue;
      index.push(ev);
      var name = opt(ev.fileName);
      if (!/^[a-zA-Z0-9-]+\.(png|jpg)$/.test(name)) { busy.remove(); toast('Evidencia no disponible'); return; }
      (function (nm) {
        chain = chain.then(function () {
          return S.getMedia(nm).then(function (blob) {
            if (!blob) throw new Error('Evidencia no disponible');
            return blob.arrayBuffer().then(function (buf) { files.push({ name: nm, data: new Uint8Array(buf) }); count++; });
          });
        });
      })(name);
    }
    chain.then(function () {
      if (count === 0) { busy.remove(); toast('No hay evidencias en este turno'); return; }
      files.push({ name: 'indice.json', data: LG.bytes.utf8(JSON.stringify(index)) });
      var bytes = LG.zip.write(files);
      busy.remove();
      R.download(new Blob([bytes], { type: 'application/zip' }), 'La-Guitarra-evidencias-' + U.today() + '.zip');
      toast('Archivo de evidencias generado');
    }, function (err) { busy.remove(); error(err); });
  }

  /* ======================= Respaldo ======================= */
  function backup() {
    if (!canSupervise()) return;
    saveMeta();
    saveRecords();
    var busy = busyOverlay('Preparando respaldo\u2026');
    createBackup().then(function (bytes) {
      busy.remove();
      R.download(new Blob([bytes], { type: 'application/zip' }),
        'La-Guitarra-respaldo-' + U.today() + '-' + Date.now() + '.zip');
      toast('Respaldo generado');
    }, function (err) { busy.remove(); error(err); });
  }

  function createBackup() {
    var root = S.backup();
    S.validate(root);
    var files = [{ name: 'data.json', data: LG.bytes.utf8(JSON.stringify(root)) }];
    var added = {};
    var chain = Promise.resolve();
    var evidence = root.evidence || [];
    for (var i = 0; i < evidence.length; i++) {
      var name = opt(evidence[i].fileName);
      if (!/^[a-zA-Z0-9-]+\.(png|jpg)$/.test(name)) return Promise.reject(new Error('Archivo de evidencia inv\u00e1lido'));
      if (added[name]) continue;
      added[name] = true;
      (function (nm) {
        chain = chain.then(function () {
          return S.getMedia(nm).then(function (blob) {
            if (!blob) throw new Error('Falta una evidencia: ' + nm);
            return blob.arrayBuffer().then(function (buf) { files.push({ name: 'media/' + nm, data: new Uint8Array(buf) }); });
          });
        });
      })(name);
    }
    return chain.then(function () { return LG.zip.write(files); });
  }

  function importBackup() {
    if (!canAdmin()) { toast('Solo el administrador puede importar respaldos'); return; }
    var input = e('input');
    input.type = 'file'; input.accept = '.zip,application/zip,application/octet-stream';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (input.parentNode) input.remove();
      if (file) readBackup(file);
    };
    input.click();
  }

  function readBackup(file) {
    var busy = busyOverlay('Validando respaldo\u2026');
    var mediaMap = {};
    file.arrayBuffer().then(function (buf) {
      var entries = LG.zip.read(new Uint8Array(buf));
      if (entries.length > 5000) throw new Error('Respaldo inv\u00e1lido');
      var names = {}, root = null;
      for (var i = 0; i < entries.length; i++) {
        var name = entries[i].name;
        if (names[name]) throw new Error('Respaldo inv\u00e1lido');
        names[name] = true;
        if (name === 'data.json') root = JSON.parse(LG.bytes.fromUtf8(entries[i].data));
        else if (/^media\/[a-zA-Z0-9-]+\.(png|jpg)$/.test(name)) mediaMap[name.slice(6)] = entries[i].data;
        else throw new Error('Ruta no permitida en respaldo');
      }
      if (!root) throw new Error('Falta data.json');
      S.validate(root);
      var ev = root.evidence || [];
      for (var j = 0; j < ev.length; j++) {
        if (!mediaMap[opt(ev[j].fileName)]) throw new Error('Falta una evidencia: ' + opt(ev[j].fileName));
      }
      busy.remove();
      alertDialog({
        title: 'Importar respaldo',
        message: root.equipment.length + ' equipos \u00b7 ' + root.turns.length + ' turnos\nReemplazar\u00e1 los datos de esta instalaci\u00f3n.',
        positive: 'Restaurar', negative: 'Cancelar',
        onPositive: function () { restoreBackup(root, mediaMap); }
      });
    }, function (err) { busy.remove(); error(err); })
      .catch(function (err) { busy.remove(); error(err); });
  }

  function restoreBackup(root, mediaMap) {
    if (!canAdmin()) return;
    var busy = busyOverlay('Restaurando datos\u2026');
    var renamed = {};
    var pendingMedia = [];
    var evidence = root.evidence || [];
    for (var i = 0; i < evidence.length; i++) {
      var old = opt(evidence[i].fileName);
      var name = renamed[old];
      if (name == null) {
        name = U.uuid() + old.slice(old.lastIndexOf('.'));
        renamed[old] = name;
        pendingMedia.push({ name: name, data: mediaMap[old] });
      }
      evidence[i].fileName = name;
    }
    var settings = root.settings || [];
    for (var s = 0; s < settings.length; s++) {
      if (opt(settings[s].key) === 'meta') {
        var m = JSON.parse(settings[s].value);
        var sig = renamed[opt(m.signature)];
        m.signature = sig == null ? '' : sig;
        settings[s].value = JSON.stringify(m);
      }
    }
    var turns = root.turns || [];
    for (var k = 0; k < turns.length; k++) {
      var tm = JSON.parse(turns[k].meta);
      var sig2 = renamed[opt(tm.signature)];
      tm.signature = sig2 == null ? '' : sig2;
      turns[k].meta = JSON.stringify(tm);
    }

    S.restore(root).then(function () {
      var chain = Promise.resolve();
      for (var p = 0; p < pendingMedia.length; p++) {
        (function (item) {
          chain = chain.then(function () {
            var mime = item.name.slice(-4).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
            return S.putMedia(item.name, new Blob([item.data], { type: mime }));
          });
        })(pendingMedia[p]);
      }
      return chain;
    }).then(function () {
      app.records = S.current();
      clearDrafts();
      var m = {};
      try { m = JSON.parse(S.setting('meta') || '{}'); } catch (er) { m = {}; }
      applyMeta(m);
      app.user = ''; app.role = '';
      saveRecords();
      busy.remove();
      show(0);
      toast('Respaldo restaurado. Inicia sesi\u00f3n con un perfil del respaldo.');
      profiles();
    }).catch(function (err) { busy.remove(); error(err); });
  }

  LG.ui = { boot: boot, show: show, toast: toast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
