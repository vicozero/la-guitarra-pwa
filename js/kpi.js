/* Kpi: cálculos equivalentes a las columnas F:O del formato KPI (puerto exacto). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;

  function Kpi(periodo, inicial, fin, mp, mc) {
    var finite = U.finite;
    var ratio = U.ratio;
    this.periodo = periodo; this.inicial = inicial; this.fin = fin; this.mp = mp; this.mc = mc;
    this.trabajo = finite(inicial) && finite(fin) && fin >= inicial ? fin - inicial : NaN;
    this.disponible = finite(periodo) && periodo > 0 && finite(mp) && finite(mc) && mp >= 0 && mc >= 0 && mp + mc <= periodo
      ? periodo - mp - mc : NaN;
    this.completo = finite(this.trabajo) && finite(this.disponible) && this.trabajo <= this.disponible + 0.000001;
    this.espera = this.completo ? Math.max(0, this.disponible - this.trabajo) : NaN;
    this.paro = this.completo ? mp + mc + this.espera : NaN;
    this.mantenimiento = ratio(mp + mc, periodo);
    this.disponibilidad = ratio(this.disponible, periodo);
    this.uso = this.completo ? ratio(this.trabajo, this.disponible) : NaN;
    this.utilizacion = this.completo ? ratio(this.trabajo, periodo) : NaN;
    this.confiabilidad = finite(mc) && mc >= 0 && mc <= periodo ? ratio(periodo - mc, periodo) : NaN;
  }

  /* MainActivity.calc(o). */
  function calc(o) {
    return new Kpi(U.value(o, 'programadas'), U.value(o, 'inicio'), U.value(o, 'final'), U.value(o, 'mp'), U.value(o, 'mc'));
  }

  LG.kpi = { Kpi: Kpi, calc: calc, finite: U.finite, ratio: U.ratio };
})();
