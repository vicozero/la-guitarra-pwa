/* DieselMetrics: interpreta "12", "12 gal", "45 L"… (puerto exacto). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;
  var LITERS_PER_GALLON = 3.785411784;

  function gallons(value) {
    if (value == null) return NaN;
    var text = String(value).trim();
    if (text === '') return NaN;
    var m = /^([0-9]+(?:[.,][0-9]+)?)\s*(gal(?:ones|on)?|l|litros?)?$/i.exec(text);
    if (!m) {
      /* El APK reconoce además "galón" y "gal" sin tilde ya cubiertos; probar variante g. */
      m = /^([0-9]+(?:[.,][0-9]+)?)\s*(gal(?:ones|on)?|galo?n|l|litros?)?$/i.exec(text.replace(/\u00f3/g, 'o'));
      if (!m) return NaN;
    }
    var amount = Number(m[1].replace(',', '.'));
    var unit = m[2];
    if (unit != null && unit.toLowerCase().indexOf('l') === 0) amount /= LITERS_PER_GALLON;
    return U.finite(amount) ? amount : NaN;
  }

  LG.diesel = { gallons: gallons, LITERS_PER_GALLON: LITERS_PER_GALLON };
})();
