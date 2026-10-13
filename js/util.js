/* La Guitarra · Control de flota — utilidades compartidas.
   Puerto fiel de Ops/CsvFormat/number/percent del APK (Java). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = (LG.util = {});

  U.finite = function (n) { return typeof n === 'number' && isFinite(n); };

  U.ratio = function (n, d) { return U.finite(n) && U.finite(d) && d > 0 ? n / d : NaN; };

  /* MainActivity.value: número o NaN. Acepta coma decimal. */
  U.value = function (o, k) {
    try {
      if (o == null) return NaN;
      var raw = o[k];
      if (raw === undefined || raw === null) return NaN;
      var v = String(raw).trim();
      if (v === '') return NaN;
      var n = Number(v.replace(',', '.'));
      return isFinite(n) ? n : NaN;
    } catch (e) { return NaN; }
  };

  /* MainActivity.number: "%.2f" quitando ceros finales; "—" si no es finito. */
  U.num = function (v) {
    if (!U.finite(v)) return '\u2014';
    var s = Math.round(v * 100) / 100;
    s = v.toFixed(2);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  };

  /* MainActivity.percent: "%.1f%%". */
  U.pct = function (v) {
    if (!U.finite(v)) return '\u2014';
    return (100 * v).toFixed(1) + '%';
  };

  U.today = function () {
    var d = new Date();
    return U.ymd(d);
  };

  U.ymd = function (d) {
    return String(d.getFullYear()).padStart(4, '0') + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  /* Ops.validDate: AAAA-MM-DD con calendario real. */
  U.validDate = function (value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
    var y = parseInt(value.slice(0, 4), 10);
    var m = parseInt(value.slice(5, 7), 10);
    var day = parseInt(value.slice(8, 10), 10);
    if (m < 1 || m > 12 || day < 1) return false;
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return day <= dim;
  };

  U.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); } }).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = []; for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  };

  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  U.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.safe = function (v) { return v == null ? '' : String(v); };

  /* Normaliza: sin acentos, mayúsculas, separadores a espacio (CatalogMigration.normal). */
  U.normal = function (s) {
    return U.safe(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  };

  U.pad2 = function (n) { return String(n).padStart(2, '0'); };

  /* Semana que comienza en lunes (Reports.weekStart). */
  U.weekStart = function (ymd) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!p) return ymd;
    var d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
    var days = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };

  U.lastDay = function (yyyyMM) {
    var p = /^(\d{4})-(\d{2})$/.exec(yyyyMM || '');
    if (!p) return yyyyMM + '-01';
    var d = new Date(Date.UTC(+p[1], +p[2], 0));
    return d.toISOString().slice(0, 10);
  };

  /* Días entre dos fechas AAAA-MM-DD. */
  U.daysBetween = function (a, b) {
    var pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || '');
    var pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '');
    if (!pa || !pb) return NaN;
    var da = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
    var db = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
    return Math.round((db - da) / 86400000);
  };

  /* Desplaza una fecha AAAA-MM-DD en n días. */
  U.addDays = function (ymd, n) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!p) return ymd;
    var d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
})();
