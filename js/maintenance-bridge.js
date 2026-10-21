/* MaintenanceBridge: puente entre la PWA y mantenimiento.exe.

   El navegador no puede escribir en una carpeta del sistema por su cuenta, así
   que se ofrecen tres caminos, en orden de comodidad:

   1. Carpeta vinculada (File System Access API, Chrome/Edge): el usuario elige
      una vez la carpeta que vigila mantenimiento.exe y la PWA escribe ahí los
      archivos automáticamente.
   2. Descarga del archivo ordenes-mantenimiento.json para dejarlo a mano en la
      carpeta de intercambio.
   3. Importación del archivo que devuelve mantenimiento.exe.

   Formato (version 2):
   {
     "format": "laguitarra-ordenes", "version": 2, "exportedAt": "...",
     "orders": [...], "handoffs": [...]
   }
*/
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});

  var EXPORT_FILE = 'ordenes-mantenimiento.json';
  var IMPORT_FILE = 'ordenes-mantenimiento-import.json';
  var WATCH_FILE = 'mantenimiento_watch.json';
  var DIR_HANDLE_KEY = '__mantenimiento_dir__';

  var timer = null;

  function SO() { return LG.shiftOrders; }
  function S() { return LG.store; }
  function U() { return LG.util; }

  /* ======================= construcción del paquete ======================= */

  function projectOrder(o) {
    return {
      id: o.id,
      equipmentId: o.equipmentId || '',
      equipment: o.equipment || '',
      eco: o.eco || '',
      description: o.description || '',
      details: o.details || '',
      priority: o.priority || 'MEDIA',
      status: o.status || 'PENDIENTE',
      fromShift: o.fromShift || '',
      toShift: o.toShift || '',
      fromDate: o.fromDate || '',
      toDate: o.toDate || '',
      createdBy: o.createdBy || '',
      assignedTo: o.assignedTo || '',
      createdAt: o.createdAt || 0,
      acceptedAt: o.acceptedAt || null,
      completedAt: o.completedAt || null,
      completionNotes: o.completionNotes || '',
      rejectionReason: o.rejectionReason || '',
      handoffId: o.handoffId || '',
      parentOrderId: o.parentOrderId || ''
    };
  }

  function buildPayload() {
    var so = SO();
    var orders = so.getShiftOrders({});
    var handoffs = so.getHandoffs({});
    var out = {
      format: 'laguitarra-ordenes',
      version: 2,
      exportedAt: new Date().toISOString(),
      origin: 'la-guitarra-pwa',
      orders: orders.map(projectOrder),
      handoffs: handoffs.map(function (h) {
        return {
          id: h.id, date: h.date, fromShift: h.fromShift, toShift: h.toShift,
          fromUser: h.fromUser, toUser: h.toUser, orders: h.orders || [],
          notes: h.notes || '', createdAt: h.createdAt
        };
      })
    };
    return out;
  }

  function jsonBlob(payload) {
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  /* ======================= carpeta vinculada ======================= */

  function supportsFolder() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function getDirHandle() {
    if (!S()) return Promise.resolve(null);
    return S().getMedia(DIR_HANDLE_KEY).then(function (h) { return h || null; }, function () { return null; });
  }

  function linkFolder() {
    if (!supportsFolder()) {
      return Promise.reject(new Error('Este navegador no permite vincular carpetas. Usa Exportar/Importar.'));
    }
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
      return S().putMedia(DIR_HANDLE_KEY, handle).then(function () {
        return askPermission(handle, true);
      }).then(function (ok) {
        if (!ok) throw new Error('Sin permiso de escritura en la carpeta');
        return handle.name;
      });
    });
  }

  function unlinkFolder() {
    return S().deleteMedia(DIR_HANDLE_KEY);
  }

  function askPermission(handle, write) {
    var opts = { mode: write ? 'readwrite' : 'read' };
    if (!handle.queryPermission) return Promise.resolve(true);
    return handle.queryPermission(opts).then(function (state) {
      if (state === 'granted') return true;
      if (!handle.requestPermission) return false;
      return handle.requestPermission(opts).then(function (s) { return s === 'granted'; });
    }, function () { return false; });
  }

  function writeToFolder(name, text) {
    return getDirHandle().then(function (handle) {
      if (!handle) throw new Error('No hay carpeta vinculada');
      return askPermission(handle, true).then(function (ok) {
        if (!ok) throw new Error('Permiso de carpeta denegado');
        return handle.getFileHandle(name, { create: true });
      }).then(function (fh) {
        return fh.createWritable();
      }).then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      }).then(function () { return true; });
    });
  }

  function readFromFolder(name) {
    return getDirHandle().then(function (handle) {
      if (!handle) throw new Error('No hay carpeta vinculada');
      return askPermission(handle, false).then(function (ok) {
        if (!ok) throw new Error('Permiso de carpeta denegado');
        return handle.getFileHandle(name);
      }).then(function (fh) { return fh.getFile(); })
        .then(function (file) { return file.text(); });
    });
  }

  /* ======================= envío por red (HTTP) ======================= */

  function endpointConfig() {
    return {
      url: S().setting('maint:url') || '',
      key: S().setting('maint:key') || ''
    };
  }

  function saveEndpointConfig(url, key) {
    return S().set('maint:url', U().safe(url).trim()).then(function () {
      return S().set('maint:key', U().safe(key).trim());
    });
  }

  function pushToEndpoint(payload) {
    var cfg = endpointConfig();
    if (!cfg.url) return Promise.reject(new Error('Configura primero la dirección del servidor de mantenimiento'));
    var body = JSON.stringify(payload || buildPayload());
    return fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SierraMadre-API-Key': cfg.key,
        'X-Portal-API-Key': cfg.key
      },
      body: body
    }).then(function (res) {
      if (!res.ok) throw new Error('El servidor respondió ' + res.status);
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        return data || { ok: true };
      });
    });
  }

  /* Trae cambios desde el servidor (si expone el listado de órdenes). */
  function pullFromEndpoint() {
    var cfg = endpointConfig();
    if (!cfg.url) return Promise.reject(new Error('Configura primero la dirección del servidor de mantenimiento'));
    return fetch(cfg.url, {
      method: 'GET',
      headers: { 'X-SierraMadre-API-Key': cfg.key, 'X-Portal-API-Key': cfg.key }
    }).then(function (res) {
      if (!res.ok) throw new Error('El servidor respondió ' + res.status);
      return res.json();
    }).then(function (data) { return importPayload(data); });
  }

  /* ======================= estado del puente ======================= */

  function status() {
    return getDirHandle().then(function (h) {
      var auto = S().setting('maint:auto') === 'yes';
      var interval = Number(S().setting('maint:interval') || 5);
      var last = S().setting('maint:last-export') || '';
      var cfg = endpointConfig();
      return {
        linked: !!h, folder: h ? h.name : '',
        auto: auto, interval: interval || 5, lastExport: last,
        url: cfg.url, hasKey: !!cfg.key
      };
    });
  }

  function watchPayload(extra) {
    var base = {
      app: 'la-guitarra-pwa',
      exportFile: EXPORT_FILE,
      importFile: IMPORT_FILE,
      updatedAt: new Date().toISOString()
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
    return base;
  }

  /* ======================= exportar ======================= */

  function exportOrders() {
    var payload = buildPayload();
    var text = JSON.stringify(payload, null, 2);
    return S().putMedia(EXPORT_FILE, jsonBlob(payload))
      .then(function () { return S().set('maint:last-export', payload.exportedAt); })
      .then(function () { return writeToFolder(EXPORT_FILE, text).catch(function () { return false; }); })
      .then(function () { return writeToFolder(WATCH_FILE, JSON.stringify(watchPayload({ status: 'ready', pending: pendingCount() }), null, 2)).catch(function () { return false; }); })
      .then(function () { return payload; });
  }

  function downloadOrders() {
    var payload = buildPayload();
    if (LG.reports && LG.reports.download) {
      LG.reports.download(JSON.stringify(payload, null, 2), EXPORT_FILE, 'application/json');
    } else {
      var url = URL.createObjectURL(jsonBlob(payload));
      var a = document.createElement('a');
      a.href = url; a.download = EXPORT_FILE;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    return S().set('maint:last-export', payload.exportedAt).then(function () {
      return S().putMedia(EXPORT_FILE, jsonBlob(payload));
    }).then(function () { return payload; });
  }

  function pendingCount() {
    var so = SO();
    var open = 0;
    var all = so.getShiftOrders({});
    for (var i = 0; i < all.length; i++) {
      if (all[i].status === 'PENDIENTE' || all[i].status === 'EN_PROCESO') open++;
    }
    return open;
  }

  /* ======================= importar ======================= */

  function normalizeIncoming(data) {
    if (!data) throw new Error('Archivo vacío');
    var orders = null;
    if (Array.isArray(data)) orders = data;
    else if (Array.isArray(data.orders)) orders = data.orders;
    if (!orders) throw new Error('El archivo no contiene órdenes');
    return { orders: orders, handoffs: Array.isArray(data.handoffs) ? data.handoffs : [] };
  }

  function importPayload(data) {
    var so = SO();
    var incoming = normalizeIncoming(data);
    var result = { imported: 0, updated: 0, handoffs: 0, errors: [] };

    for (var i = 0; i < incoming.orders.length; i++) {
      var raw = incoming.orders[i] || {};
      var id = String(raw.id == null ? '' : raw.id).trim();
      if (id === '') { result.errors.push('Orden sin id'); continue; }
      var existing = null;
      var all = so.getShiftOrders({});
      for (var j = 0; j < all.length; j++) if (all[j].id === id) { existing = all[j]; break; }

      if (existing) {
        var changed = false;
        var fields = ['status', 'assignedTo', 'acceptedAt', 'completedAt', 'completionNotes', 'priority', 'details', 'toShift', 'toDate', 'rejectionReason'];
        for (var f = 0; f < fields.length; f++) {
          var key = fields[f];
          if (raw[key] == null || raw[key] === '') continue;
          if (existing[key] !== raw[key]) {
            so.update(so.TABLE, id, key, raw[key]);
            changed = true;
          }
        }
        if (changed) { so.update(so.TABLE, id, 'updatedAt', Date.now()); result.updated++; }
      } else {
        var created = {
          id: id,
          fromShift: so.normalizeShift(raw.fromShift || 'Turno 1'),
          toShift: so.normalizeShift(raw.toShift || 'Turno 1'),
          fromDate: raw.fromDate || U().today(),
          toDate: raw.toDate || U().today(),
          equipmentId: raw.equipmentId || '',
          equipment: raw.equipment || '',
          eco: raw.eco || '',
          description: raw.description || 'Orden importada de mantenimiento.exe',
          details: raw.details || '',
          priority: raw.priority || 'MEDIA',
          status: raw.status || 'PENDIENTE',
          createdBy: raw.createdBy || 'mantenimiento.exe',
          createdAt: raw.createdAt || Date.now(),
          updatedAt: Date.now(),
          assignedTo: raw.assignedTo || '',
          acceptedAt: raw.acceptedAt || null,
          completedAt: raw.completedAt || null,
          completionNotes: raw.completionNotes || '',
          handoffId: raw.handoffId || '',
          parentOrderId: raw.parentOrderId || '',
          attachments: []
        };
        so.put(so.TABLE, created);
        result.imported++;
      }
    }

    for (var h = 0; h < incoming.handoffs.length; h++) {
      var hh = incoming.handoffs[h] || {};
      if (!hh.id) continue;
      var dupe = false;
      var handoffs = so.getHandoffs({});
      for (var q = 0; q < handoffs.length; q++) if (handoffs[q].id === hh.id) { dupe = true; break; }
      if (!dupe) { so.put(so.HANDOFF_TABLE, hh); result.handoffs++; }
    }

    return S().save().then(function () { return result; });
  }

  function importFile(file) {
    if (!file) return Promise.reject(new Error('Selecciona un archivo'));
    return file.text().then(function (txt) {
      // Algunas herramientas de Windows agregan BOM al guardar el JSON.
      var limpio = txt.replace(/^\uFEFF/, '');
      var data;
      try { data = JSON.parse(limpio); } catch (e) { throw new Error('El archivo no es un JSON válido'); }
      return importPayload(data);
    });
  }

  function importFromLinkedFolder() {
    return readFromFolder(IMPORT_FILE).then(function (txt) {
      var limpio = txt.replace(/^\uFEFF/, '');
      var data;
      try { data = JSON.parse(limpio); } catch (e) { throw new Error('El archivo de importación no es JSON válido'); }
      return importPayload(data);
    });
  }

  function importFromStorage() {
    return S().getMedia(IMPORT_FILE).then(function (blob) {
      if (!blob) throw new Error('No hay archivo de importación guardado');
      return blob.text();
    }).then(function (txt) { return importPayload(JSON.parse(txt.replace(/^\uFEFF/, ''))); });
  }

  /* ======================= exportación automática ======================= */

  function startAutoExport(minutes) {
    stopAutoExport();
    var mins = Number(minutes) || 5;
    if (mins < 1) mins = 1;
    S().set('maint:auto', 'yes');
    S().set('maint:interval', String(mins));
    timer = setInterval(function () {
      exportOrders().catch(function () { });
    }, mins * 60 * 1000);
    return Promise.resolve(mins);
  }

  function stopAutoExport() {
    if (timer) { clearInterval(timer); timer = null; }
    return S().set('maint:auto', 'no');
  }

  function resumeAutoExport() {
    if (S().setting('maint:auto') !== 'yes') return null;
    var mins = Number(S().setting('maint:interval') || 5) || 5;
    return startAutoExport(mins);
  }

  /* ======================= avisos ======================= */

  function notifyNewOrder(order) {
    return exportOrders().then(function () { return order; }).catch(function () { return order; });
  }

  function notifyOrderUpdate(orderId, status) {
    return exportOrders().then(function () { return { orderId: orderId, status: status }; })
      .catch(function () { return { orderId: orderId, status: status }; });
  }

  LG.maintenance = {
    EXPORT_FILE: EXPORT_FILE,
    IMPORT_FILE: IMPORT_FILE,
    WATCH_FILE: WATCH_FILE,
    supportsFolder: supportsFolder,
    linkFolder: linkFolder,
    unlinkFolder: unlinkFolder,
    getDirHandle: getDirHandle,
    status: status,
    buildPayload: buildPayload,
    exportOrders: exportOrders,
    downloadOrders: downloadOrders,
    endpointConfig: endpointConfig,
    saveEndpointConfig: saveEndpointConfig,
    pushToEndpoint: pushToEndpoint,
    pullFromEndpoint: pullFromEndpoint,
    importPayload: importPayload,
    importFile: importFile,
    importFromLinkedFolder: importFromLinkedFolder,
    importFromStorage: importFromStorage,
    startAutoExport: startAutoExport,
    stopAutoExport: stopAutoExport,
    resumeAutoExport: resumeAutoExport,
    pendingCount: pendingCount,
    notifyNewOrder: notifyNewOrder,
    notifyOrderUpdate: notifyOrderUpdate
  };
})();
