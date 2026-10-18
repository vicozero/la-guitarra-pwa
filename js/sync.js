/* Sincronización de supervisión. La llave permanece solo en este dispositivo. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var S = LG.store;
  var DEFAULT_URL = 'https://sierra-madre-consulta-api.feywren128.chatgpt.site';

  function config() {
    return { url: (S.setting('portal-api-url') || DEFAULT_URL).replace(/\/$/, ''), key: S.setting('portal-api-key') || '' };
  }
  function configured() { var c = config(); return !!(c.url && c.key); }
  function asNumber(value) { var number = Number(value); return Number.isFinite(number) ? number : null; }
  function recordId(meta, row) { return ['laguitarra', meta.fecha, meta.turno, row.id || row.eco || row.equipo].join(':'); }
  function turnRows(records, meta, identity) {
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var row = records[i] || {};
      if (row.kpi === false) continue;
      var k = LG.kpi.calc(row);
      if (!k.completo) continue;
      out.push({
        source_id: recordId(meta, row), source: 'La Guitarra', date: meta.fecha, shift: meta.turno || '',
        supervisor: String(meta.supervisor || identity.user || '').trim(), administrator: identity.user || '', role: identity.role || '',
        equipment: String(row.eco || row.equipo || '').trim(), description: String(row.equipo || '').trim(), family: String(row.familia || '').trim(),
        availability: asNumber(k.disponibilidad) === null ? null : k.disponibilidad * 100,
        utilization: asNumber(k.utilizacion) === null ? null : k.utilizacion * 100,
        worked_hours: asNumber(k.trabajo), mp_hours: asNumber(k.mp), mc_hours: asNumber(k.mc),
        standby_hours: asNumber(k.espera), status: String(row.estado || ''), captured_at: new Date().toISOString()
      });
    }
    return out;
  }
  function transportRow(row) {
    var supervisor = String(row.supervisor || 'Sin supervisor').replace(/[|\n\r]/g, ' ').trim();
    var status = String(row.status || 'SIN ESTADO').replace(/[|\n\r]/g, ' ').trim();
    return {
      date: row.date, equipment: row.equipment, description: row.description, family: row.family, shift: row.shift,
      component: 'SUPERVISIÓN · ' + supervisor, hi: '', hf: '', worked_hours: row.worked_hours,
      mp_hours: row.mp_hours, mc_hours: row.mc_hours, standby_hours: row.standby_hours, stops: 0,
      status: 'SUPERVISIÓN|' + status + '|A=' + (row.availability == null ? '' : Number(row.availability).toFixed(2)) + '|U=' + (row.utilization == null ? '' : Number(row.utilization).toFixed(2))
    };
  }
  function sameTransport(row, candidate) {
    return String(row.date || '') === String(candidate.date || '') && String(row.equipment || '') === String(candidate.equipment || '') &&
      String(row.shift || '') === String(candidate.shift || '') && String(row.component || '') === String(candidate.component || '');
  }
  function queue() { try { return JSON.parse(S.setting('portal-sync-pending') || '[]'); } catch (e) { return []; } }
  function saveQueue(value) { return S.set('portal-sync-pending', JSON.stringify(value)); }
  function enqueue(records, meta, identity) {
    var additions = turnRows(records, meta, identity);
    var existing = queue();
    var map = {};
    existing.concat(additions).forEach(function (row) { map[row.source_id] = row; });
    return saveQueue(Object.keys(map).map(function (id) { return map[id]; }));
  }
  function publish() {
    var c = config(), pending = queue();
    if (!c.key) return Promise.reject(new Error('Configura la clave del portal en Reportes antes de sincronizar.'));
    if (!pending.length) return Promise.resolve({ count: 0 });
    return fetch(c.url + '/api/portal', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('No se pudo leer el portal (' + response.status + ').');
      return response.json();
    }).then(function (payload) {
      var current = Array.isArray(payload.bitacora) ? payload.bitacora : [];
      pending.map(transportRow).forEach(function (row) {
        if (!current.some(function (item) { return sameTransport(item || {}, row); })) current.push(row);
      });
      payload.bitacora = current;
      return fetch(c.url + '/api/portal/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-API-Key': c.key }, body: JSON.stringify(payload) });
    }).then(function (response) {
      if (!response.ok) throw new Error('El portal rechazó la sincronización (' + response.status + ').');
      return fetch(c.url + '/api/portal', { cache: 'no-store' });
    }).then(function (response) { return response.json(); }).then(function (payload) {
      var delivered = pending.every(function (row) {
        var expected = transportRow(row);
        return Array.isArray(payload.bitacora) && payload.bitacora.some(function (item) { return sameTransport(item || {}, expected); });
      });
      if (!delivered) throw new Error('La API no confirmó los registros de supervisión. El turno quedó pendiente en este dispositivo.');
      return saveQueue([]).then(function () { return { count: pending.length }; });
    });
  }
  LG.sync = { config: config, configured: configured, queue: queue, enqueue: enqueue, publish: publish, defaultUrl: DEFAULT_URL };
})();
