/* CsvFormat.cell: comillas y protección contra fórmulas (puerto exacto). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});

  function cell(value) {
    var v = value == null ? '' : String(value);
    var start = v.trim();
    if (v.charAt(0) === '\t' || v.charAt(0) === '\r' || v.charAt(0) === '\n' ||
      (start.length > 0 && '=+-@'.indexOf(start.charAt(0)) >= 0)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  LG.csv = { cell: cell };
})();
