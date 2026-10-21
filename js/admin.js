/* AdminPanel: panel de administración para La Guitarra PWA.
   Incluye: admin pre-creado (admin/123admin), gestión de supervisores, turnos, auditoría. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util, S = LG.store, SO = LG.shiftOrders;

  var ADMIN_USERNAME = 'admin';
  var ADMIN_PASSWORD = '123admin';

  /* ======================= Inicialización del admin ======================= */
  function ensureAdmin() {
    var users = S.rows('users');
    var hasAdmin = false;
    for (var i = 0; i < users.length; i++) {
      if (U.safe(users[i].name).toLowerCase() === ADMIN_USERNAME) hasAdmin = true;
    }
    if (hasAdmin) return Promise.resolve(false);
    var salt = LG.pin.salt();
    return LG.pin.hash(ADMIN_PASSWORD, salt).then(function (hash) {
      return S.put('users', {
        id: U.uuid(),
        name: ADMIN_USERNAME,
        role: 'Administrador',
        salt: salt,
        hash: hash,
        shift: 'Turno 1',
        createdAt: Date.now()
      });
    }).then(function () { return true; });
  }

  /* ======================= Utilidades de usuario ======================= */
  function getUsers() {
    return S.rows('users', 'name');
  }

  function getUserByName(name) {
    var users = getUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === name) return users[i];
    }
    return null;
  }

  function createUser(name, pin, role, shift) {
    var salt = LG.pin.salt();
    return LG.pin.hash(pin, salt).then(function (hash) {
      return S.put('users', {
        id: U.uuid(),
        name: name,
        role: role,
        salt: salt,
        hash: hash,
        shift: shift || 'Turno 1',
        createdAt: Date.now()
      });
    }).then(function () {
      var users = S.rows('users');
      for (var i = 0; i < users.length; i++) if (users[i].name === name) return users[i];
      return null;
    });
  }

  function updateUser(userId, updates) {
    var users = S.root().users;
    for (var i = 0; i < users.length; i++) {
      if (U.safe(users[i].id) === userId) {
        for (var k in updates) users[i][k] = updates[k];
        return S.save();
      }
    }
    return Promise.reject(new Error('Usuario no encontrado'));
  }

  function deleteUser(userId) {
    var users = S.root().users;
    for (var i = 0; i < users.length; i++) {
      if (U.safe(users[i].id) === userId) {
        users.splice(i, 1);
        return S.save();
      }
    }
    return Promise.reject(new Error('Usuario no encontrado'));
  }

  function changePin(userId, newPin) {
    var salt = LG.pin.salt();
    return LG.pin.hash(newPin, salt).then(function (hash) {
      return updateUser(userId, { salt: salt, hash: hash });
    });
  }

  function assignShift(userId, shift) {
    return updateUser(userId, { shift: SO.normalizeShift(shift) });
  }

  /* ======================= Auditoría ======================= */
  var AUDIT_TABLE = 'auditLog';

  function logAudit(action, details) {
    var entry = {
      id: U.uuid(),
      timestamp: Date.now(),
      user: LG.app ? LG.app.user : 'system',
      role: LG.app ? LG.app.role : 'system',
      action: action,
      details: details
    };
    var root = S.root();
    if (!root[AUDIT_TABLE]) root[AUDIT_TABLE] = [];
    root[AUDIT_TABLE].push(entry);
    if (root[AUDIT_TABLE].length > 5000) root[AUDIT_TABLE] = root[AUDIT_TABLE].slice(-5000);
    return S.save();
  }

  function getAuditLog(filter) {
    var root = S.root();
    var log = root[AUDIT_TABLE] || [];
    if (!filter) return log.slice().reverse();
    return log.filter(function (e) {
      if (filter.user && e.user !== filter.user) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.from && e.timestamp < filter.from) return false;
      if (filter.to && e.timestamp > filter.to) return false;
      return true;
    }).reverse();
  }

  /* ======================= Configuración del sistema ======================= */
  function setSystemConfig(key, value) {
    return S.set('sys:' + key, value);
  }

  function getSystemConfig(key, defaultValue) {
    var v = S.setting('sys:' + key);
    return v === '' ? defaultValue : v;
  }

  function getSystemConfigs() {
    var keys = ['maintenance-auto-export', 'maintenance-export-interval', 'alert-sound', 'require-signature'];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = getSystemConfig(keys[i], '');
    }
    return out;
  }

  /* ======================= Backup extendido ======================= */
  function createFullBackup() {
    var root = S.backup();
    S.validate(root);
    var files = [{ name: 'data.json', data: LG.bytes.utf8(JSON.stringify(root)) }];
    var chain = Promise.resolve();
    var evidence = root.evidence || [];
    var added = {};
    for (var i = 0; i < evidence.length; i++) {
      var name = U.safe(evidence[i].fileName);
      if (!/^[a-zA-Z0-9-]+\.(png|jpg|mp4|webm)$/.test(name)) continue;
      if (added[name]) continue;
      added[name] = true;
      (function (nm) {
        chain = chain.then(function () {
          return S.getMedia(nm).then(function (blob) {
            if (!blob) throw new Error('Falta evidencia: ' + nm);
            return blob.arrayBuffer().then(function (buf) { files.push({ name: 'media/' + nm, data: new Uint8Array(buf) }); });
          });
        });
      })(name);
    }
    return chain.then(function () { return LG.zip.write(files); });
  }

  /* ======================= API pública ======================= */
  LG.admin = {
    ADMIN_USERNAME: ADMIN_USERNAME,
    ADMIN_PASSWORD: ADMIN_PASSWORD,
    ensureAdmin: ensureAdmin,
    getUsers: getUsers,
    getUserByName: getUserByName,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    changePin: changePin,
    assignShift: assignShift,
    logAudit: logAudit,
    getAuditLog: getAuditLog,
    setSystemConfig: setSystemConfig,
    getSystemConfig: getSystemConfig,
    getSystemConfigs: getSystemConfigs,
    createFullBackup: createFullBackup
  };
})();