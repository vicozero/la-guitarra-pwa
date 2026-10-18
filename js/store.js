/* Store: base de datos local (IndexedDB) con el mismo formato que el respaldo
   "guitarra-backup" v1 del APK/escritorio. Puerto fiel de OperationsStore/Store. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util;

  var BACKUP_TABLES = ['equipment', 'settings', 'turns', 'users', 'orders', 'preventive', 'evidence'];
  var DB_NAME = 'laguitarra';
  var DB_VERSION = 1;

  var db = null;
  var root = null;

  function empty() {
    var r = { format: 'guitarra-backup', version: 1, created: Date.now() };
    for (var i = 0; i < BACKUP_TABLES.length; i++) r[BACKUP_TABLES[i]] = [];
    return r;
  }

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media');
      };
      r.onsuccess = function () { db = r.result; resolve(db); };
      r.onerror = function () { reject(r.error); };
    });
  }

  // Actualiza únicamente el nombre; conserva identificación, capturas e historial.
  function equipmentName(name) {
    return typeof name === 'string' ? name.replace(/\bPALA\b/gi, 'SCOOPTRAM') : name;
  }

  function migrateEquipmentNames() {
    var changed = false;
    function rename(item) {
      if (!item || typeof item !== 'object') return;
      var name = equipmentName(item.equipo);
      if (name !== item.equipo) { item.equipo = name; changed = true; }
    }
    function updateRow(row, list) {
      if (!row || typeof row.data !== 'string') return;
      var value;
      try { value = JSON.parse(row.data); } catch (e) { return; }
      var before = JSON.stringify(value);
      if (list && Array.isArray(value)) value.forEach(rename);
      else if (!list) rename(value);
      if (JSON.stringify(value) !== before) row.data = JSON.stringify(value);
    }
    root.equipment.forEach(function (row) { updateRow(row, false); });
    root.turns.forEach(function (row) { updateRow(row, true); });
    return changed;
  }

  function load() {
    return openDb().then(function () {
      return req(db.transaction('kv', 'readonly').objectStore('kv').get('data'));
    }).then(function (data) {
      root = (data && typeof data === 'object') ? data : empty();
      for (var i = 0; i < BACKUP_TABLES.length; i++) {
        if (!Array.isArray(root[BACKUP_TABLES[i]])) root[BACKUP_TABLES[i]] = [];
      }
      if (migrateEquipmentNames()) return persist().then(function () { return root; });
      return root;
    });
  }

  function persist() {
    return req(db.transaction('kv', 'readwrite').objectStore('kv').put(root, 'data'));
  }

  function save() { return persist(); }

  /* ---- settings ---- */
  function findSetting(key) {
    var a = root.settings;
    for (var i = 0; i < a.length; i++) if (a[i] && a[i].key === key) return a[i];
    return null;
  }
  function setSetting(key, value) {
    var s = findSetting(key);
    if (!s) root.settings.push({ key: key, value: value });
    else s.value = value;
  }
  function setting(key) { var s = findSetting(key); return s ? U.safe(s.value) : ''; }
  function set(key, value) { setSetting(key, value == null ? '' : String(value)); return save(); }
  function meta(o) { setSetting('meta', JSON.stringify(o)); return save(); }
  function draft(key, value) { if (key.indexOf('draft-') !== 0) throw new Error('draft'); setSetting(key, value); return save(); }
  function removeDraft(key) {
    if (key.indexOf('draft-') !== 0) throw new Error('draft');
    var a = root.settings;
    for (var i = 0; i < a.length; i++) if (a[i] && a[i].key === key) { a.splice(i, 1); break; }
    return save();
  }

  /* ---- catálogo ---- */
  function current() {
    var rows = root.equipment.slice().sort(function (x, y) { return (x.position | 0) - (y.position | 0); });
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      try { out.push(JSON.parse(rows[i].data)); } catch (e) { throw new Error('Catálogo dañado'); }
    }
    return out;
  }

  function setCurrent(records, metaObj) {
    var a = [];
    for (var i = 0; i < records.length; i++) a.push({ id: records[i].id, position: i, data: JSON.stringify(records[i]) });
    root.equipment = a;
    setSetting('meta', JSON.stringify(metaObj));
    setSetting('initialized', 'yes');
    return save();
  }

  function initialized() { return setting('initialized') === 'yes'; }

  /* ---- turnos ---- */
  function turnKey(date, shift) { return date + '\n' + U.safe(shift).trim(); }

  function archive(records, metaObj) {
    validateMeta(metaObj);
    var v = {
      key: turnKey(metaObj.fecha, metaObj.turno),
      date: metaObj.fecha, shift: metaObj.turno,
      data: JSON.stringify(records), meta: JSON.stringify(metaObj), updated: Date.now()
    };
    var turns = root.turns;
    for (var i = 0; i < turns.length; i++) if (turns[i] && turns[i].key === v.key) { turns[i] = v; return save(); }
    turns.push(v);
    return save();
  }

  function hasTurn(key) {
    for (var i = 0; i < root.turns.length; i++) if (root.turns[i] && root.turns[i].key === key) return true;
    return false;
  }

  function removeTurn(key) {
    var a = root.turns;
    for (var i = 0; i < a.length; i++) if (a[i] && a[i].key === key) { a.splice(i, 1); return save(); }
    return save();
  }

  function renameTurn(key, fecha, turno) {
    var a = root.turns;
    for (var i = 0; i < a.length; i++) {
      var t = a[i];
      if (!t || t.key !== key) continue;
      var nk = turnKey(fecha, turno);
      if (nk !== key) for (var j = 0; j < a.length; j++) {
        if (j !== i && a[j] && a[j].key === nk) throw new Error('Ya existe un reporte para esa fecha y turno');
      }
      var m = JSON.parse(t.meta);
      m.fecha = fecha; m.turno = turno;
      validateMeta(m);
      t.key = nk; t.date = fecha; t.shift = turno; t.meta = JSON.stringify(m);
      return save();
    }
    throw new Error('El reporte ya no existe');
  }

  /* ---- tablas genéricas ---- */
  function rows(table, order) {
    if (BACKUP_TABLES.indexOf(table) < 0) throw new Error('Tabla ' + table);
    var list = [];
    var src = root[table];
    for (var i = 0; i < src.length; i++) if (src[i]) list.push(src[i]);
    if (order && String(order).trim() !== '') {
      var parts = String(order).trim().split(',');
      list.sort(function (a, b) {
        for (var p = 0; p < parts.length; p++) {
          var bits = parts[p].trim().split(/\s+/);
          var col = bits[0];
          var desc = bits.length > 1 && /^DESC$/i.test(bits[1]);
          var av = a[col], bv = b[col];
          var an = Number(av), bn = Number(bv);
          var cmp;
          if (U.safe(av) !== '' && U.safe(bv) !== '' && isFinite(an) && isFinite(bn)) cmp = an < bn ? -1 : an > bn ? 1 : 0;
          else cmp = U.safe(av) < U.safe(bv) ? -1 : U.safe(av) > U.safe(bv) ? 1 : 0;
          if (cmp !== 0) return desc ? -cmp : cmp;
        }
        return 0;
      });
    }
    return U.clone(list);
  }

  function put(table, obj) {
    if (['users', 'orders', 'preventive', 'evidence'].indexOf(table) < 0) throw new Error('Tabla ' + table);
    var a = root[table];
    var id = U.safe(obj.id);
    if (id !== '') for (var i = 0; i < a.length; i++) if (a[i] && U.safe(a[i].id) === id) { a[i] = obj; return save(); }
    if (table === 'users') for (var j = 0; j < a.length; j++) {
      if (a[j] && U.safe(a[j].name).toLowerCase() === U.safe(obj.name).toLowerCase()) { a[j] = obj; return save(); }
    }
    a.push(obj);
    return save();
  }

  function update(table, id, column, value) {
    if (!((table === 'orders' && (column === 'status' || column === 'closed')) ||
      (table === 'preventive' && column === 'status'))) throw new Error('update');
    var a = root[table];
    for (var i = 0; i < a.length; i++) if (a[i] && U.safe(a[i].id) === id) { a[i][column] = value; break; }
    return save();
  }

  function backup() { return U.clone(root); }

  function restore(source) { validate(source); root = source; migrateEquipmentNames(); return save(); }

  /* ---- validación (OperationsStore.validate) ---- */
  function b64len(b64) { try { return atob(b64).length; } catch (e) { throw new Error('Credencial inválida'); } }

  function validate(r) {
    if (!r || U.safe(r.format) !== 'guitarra-backup' || (r.version | 0) !== 1) throw new Error('Respaldo incompatible');
    for (var t = 0; t < BACKUP_TABLES.length; t++) {
      var arr = r[BACKUP_TABLES[t]];
      if (!Array.isArray(arr)) throw new Error('Respaldo inválido');
      if (arr.length > 20000) throw new Error('Respaldo demasiado grande');
    }
    validateEquipment(r.equipment);
    var foundMeta = false, initialized = false;
    for (var i = 0; i < r.settings.length; i++) {
      var item = r.settings[i];
      if (U.safe(item.key) === 'meta') { validateMeta(JSON.parse(item.value)); foundMeta = true; }
      if (U.safe(item.key) === 'initialized' && U.safe(item.value) === 'yes') initialized = true;
    }
    if (!foundMeta || !initialized) throw new Error('Faltan datos del turno actual');
    for (var k = 0; k < r.turns.length; k++) {
      var turn = r.turns[k], m = JSON.parse(turn.meta);
      validateMeta(m);
      if (U.safe(turn.key) !== turnKey(m.fecha, m.turno) || U.safe(turn.date) !== U.safe(m.fecha) || U.safe(turn.shift) !== U.safe(m.turno))
        throw new Error('Identificación de turno inconsistente');
      var records = JSON.parse(turn.data);
      if (records.length > 200) throw new Error('Demasiados equipos en turno');
      for (var q = 0; q < records.length; q++) if (U.safe(records[q].id) === '' || U.safe(records[q].equipo) === '')
        throw new Error('Equipo histórico inválido');
    }
    var admin = false, names = {};
    for (var u = 0; u < r.users.length; u++) {
      var user = r.users[u];
      var role = U.safe(user.role), name = U.safe(user.name).trim();
      if (name === '' || names[name.toUpperCase()]) throw new Error('Usuario inválido o duplicado');
      names[name.toUpperCase()] = true;
      if (['Administrador', 'Supervisor', 'Mecánico'].indexOf(role) < 0) throw new Error('Rol inválido');
      if (b64len(U.safe(user.salt)) !== 16 || b64len(U.safe(user.hash)) !== 32) throw new Error('Credencial inválida');
      if (role === 'Administrador') admin = true;
    }
    if (!admin) throw new Error('Respaldo sin administrador');
  }

  function validateEquipment(records) {
    if (records.length > 200) throw new Error('Más de 200 equipos');
    var ids = {}, positions = {};
    for (var i = 0; i < records.length; i++) {
      var row = records[i], o = JSON.parse(row.data);
      if (U.safe(o.id) === '' || U.safe(o.equipo) === '' || U.safe(o.id) !== U.safe(row.id) || ids[row.id] || positions[row.position])
        throw new Error('Equipo inválido o duplicado');
      ids[row.id] = true; positions[row.position] = true;
    }
  }

  function validateMeta(m) {
    if (!U.validDate(m.fecha)) throw new Error('Fecha inválida');
    if (U.safe(m.turno).trim() === '') throw new Error('Turno vacío');
    var sig = U.safe(m.signature);
    if (sig !== '' && !/^[a-zA-Z0-9-]+\.png$/.test(sig)) throw new Error('Firma inválida');
  }

  /* ---- media ---- */
  function putMedia(name, blob) { return req(db.transaction('media', 'readwrite').objectStore('media').put(blob, name)); }
  function getMedia(name) { return req(db.transaction('media', 'readonly').objectStore('media').get(name)); }
  function hasMedia(name) { return req(db.transaction('media', 'readonly').objectStore('media').getKey(name)).then(function (k) { return k !== undefined && k !== null; }); }
  function deleteMedia(name) { return req(db.transaction('media', 'readwrite').objectStore('media').delete(name)); }
  function mediaKeys() { return req(db.transaction('media', 'readonly').objectStore('media').getAllKeys()); }

  LG.store = {
    equipmentName: equipmentName, empty: empty, load: load, save: save, persistNow: persist,
    setting: setting, set: set, meta: meta, draft: draft, removeDraft: removeDraft,
    current: current, setCurrent: setCurrent, initialized: initialized,
    turnKey: turnKey, archive: archive, hasTurn: hasTurn, removeTurn: removeTurn, renameTurn: renameTurn,
    rows: rows, put: put, update: update,
    backup: backup, restore: restore, validate: validate, validateMeta: validateMeta,
    putMedia: putMedia, getMedia: getMedia, hasMedia: hasMedia, deleteMedia: deleteMedia, mediaKeys: mediaKeys,
    root: function () { return root; }
  };
})();
