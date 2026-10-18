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
      var previous = Array.isArray(payload.supervision) ? payload.supervision : [];
      var merged = {}, rows = previous.concat(pending);
      rows.forEach(function (row) { if (row && row.source_id) merged[row.source_id] = row; });
      payload.supervision = Object.keys(merged).map(function (id) { return merged[id]; });
      return fetch(c.url + '/api/portal/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-API-Key': c.key }, body: JSON.stringify(payload) });
    }).then(function (response) {
      if (!response.ok) throw new Error('El portal rechazó la sincronización (' + response.status + ').');
      return fetch(c.url + '/api/portal', { cache: 'no-store' });
    }).then(function (response) { return response.json(); }).then(function (payload) {
      if (!Array.isArray(payload.supervision)) throw new Error('La API actual todavía no acepta registros de supervisión. El turno quedó pendiente en este dispositivo.');
      return saveQueue([]).then(function () { return { count: pending.length }; });
    });
  }
  LG.sync = { config: config, configured: configured, queue: queue, enqueue: enqueue, publish: publish, defaultUrl: DEFAULT_URL };
})();
