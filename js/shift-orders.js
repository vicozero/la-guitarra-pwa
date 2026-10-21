/* ShiftOrders: órdenes de trabajo que pasan de un turno al siguiente.
   Turno 1 → Turno 2 → Turno 3 → Turno 1 ...
   Cada orden conserva quién la creó, a qué turno va, su prioridad y su estado. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var U = LG.util, S = LG.store;

  var TABLE = 'shiftOrders';
  var HANDOFF_TABLE = 'shiftHandoffs';
  var TABLES = ['shiftOrders', 'shiftHandoffs'];

  var ORDER_STATUSES = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'RECHAZADA'];
  var PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
  var SHIFTS = ['Turno 1', 'Turno 2', 'Turno 3'];

  /* ======================= utilidades ======================= */
  function today() { return U.today(); }
  function now() { return Date.now(); }
  function uuid() { return U.uuid(); }

  function normalizeShift(shift) {
    var s = U.safe(shift).trim().toUpperCase();
    if (s === 'TURNO 1' || s === '1' || s === 'DÍA' || s === 'DIA' || s === 'DIURNO') return 'Turno 1';
    if (s === 'TURNO 2' || s === '2' || s === 'TARDE' || s === 'VESPERTINO') return 'Turno 2';
    if (s === 'TURNO 3' || s === '3' || s === 'NOCHE' || s === 'NOCTURNO') return 'Turno 3';
    return s || 'Turno 1';
  }

  function nextShift(current) {
    var c = normalizeShift(current);
    if (c === 'Turno 1') return 'Turno 2';
    if (c === 'Turno 2') return 'Turno 3';
    return 'Turno 1';
  }

  function prevShift(current) {
    var c = normalizeShift(current);
    if (c === 'Turno 3') return 'Turno 2';
    if (c === 'Turno 2') return 'Turno 1';
    return 'Turno 3';
  }

  function shiftIndex(current) { return SHIFTS.indexOf(normalizeShift(current)); }

  function formatDate(d) {
    if (!d) return today();
    var s = U.safe(d).slice(0, 10);
    if (!U.validDate(s)) return today();
    return s;
  }

  /* ======================= tablas genéricas ======================= */
  function table(name) {
    if (TABLES.indexOf(name) < 0) throw new Error('Tabla ' + name);
    var root = S.root();
    if (!root) throw new Error('Base de datos no cargada');
    if (!Array.isArray(root[name])) root[name] = [];
    return root[name];
  }

  function rows(name) {
    var src = table(name);
    var out = [];
    for (var i = 0; i < src.length; i++) if (src[i]) out.push(src[i]);
    return U.clone(out);
  }

  function put(name, obj) {
    var a = table(name);
    var id = U.safe(obj.id);
    if (id !== '') {
      for (var i = 0; i < a.length; i++) {
        if (a[i] && U.safe(a[i].id) === id) { a[i] = obj; return S.save(); }
      }
    }
    a.push(obj);
    return S.save();
  }

  function remove(name, id) {
    var a = table(name);
    for (var i = 0; i < a.length; i++) {
      if (a[i] && U.safe(a[i].id) === id) { a.splice(i, 1); return S.save(); }
    }
    return S.save();
  }

  function setFields(name, id, fields) {
    var a = table(name);
    for (var i = 0; i < a.length; i++) {
      if (!a[i] || U.safe(a[i].id) !== id) continue;
      for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) a[i][k] = fields[k];
      return S.save();
    }
    return Promise.reject(new Error('Registro no encontrado'));
  }

  function update(name, id, column, value) {
    var patch = {};
    patch[column] = value;
    return setFields(name, id, patch);
  }

  /* ======================= órdenes ======================= */
  function createShiftOrder(data) {
    var order = {
      id: uuid(),
      fromShift: normalizeShift(data.fromShift),
      toShift: normalizeShift(data.toShift),
      fromDate: formatDate(data.fromDate || today()),
      toDate: formatDate(data.toDate || today()),
      equipmentId: U.safe(data.equipmentId),
      equipment: U.safe(data.equipment),
      eco: U.safe(data.eco),
      description: U.safe(data.description),
      details: U.safe(data.details),
      priority: PRIORITIES.indexOf(data.priority) >= 0 ? data.priority : 'MEDIA',
      status: 'PENDIENTE',
      createdBy: U.safe(data.createdBy),
      createdAt: now(),
      updatedAt: now(),
      assignedTo: U.safe(data.assignedTo),
      acceptedAt: null,
      completedAt: null,
      completionNotes: '',
      rejectionReason: '',
      handoffId: U.safe(data.handoffId),
      parentOrderId: U.safe(data.parentOrderId),
      attachments: []
    };
    return put(TABLE, order).then(function () { return order; });
  }

  function getOrder(id) {
    var all = rows(TABLE);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function getShiftOrders(filter) {
    filter = filter || {};
    var list = rows(TABLE);
    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (filter.openOnly) list = list.filter(function (o) { return o.status === 'PENDIENTE' || o.status === 'EN_PROCESO'; });
    if (filter.status) {
      if (Object.prototype.toString.call(filter.status) === '[object Array]') {
        list = list.filter(function (o) { return filter.status.indexOf(o.status) >= 0; });
      } else {
        list = list.filter(function (o) { return o.status === filter.status; });
      }
    }
    if (filter.fromShift) list = list.filter(function (o) { return o.fromShift === normalizeShift(filter.fromShift); });
    if (filter.toShift) list = list.filter(function (o) { return o.toShift === normalizeShift(filter.toShift); });
    if (filter.equipmentId) list = list.filter(function (o) { return o.equipmentId === filter.equipmentId; });
    if (filter.createdBy) list = list.filter(function (o) { return o.createdBy === filter.createdBy; });
    if (filter.assignedTo) list = list.filter(function (o) { return o.assignedTo === filter.assignedTo; });
    if (filter.fromDate) list = list.filter(function (o) { return o.toDate >= filter.fromDate; });
    if (filter.toDate) list = list.filter(function (o) { return o.fromDate <= filter.toDate; });
    if (filter.priority) list = list.filter(function (o) { return o.priority === filter.priority; });
    if (filter.query) {
      var q = U.normal(filter.query);
      list = list.filter(function (o) {
        return U.normal(o.description + ' ' + o.equipment + ' ' + o.eco + ' ' + o.details).indexOf(q) >= 0;
      });
    }
    return list;
  }

  function getUserShift(user) {
    var users = S.rows('users');
    for (var i = 0; i < users.length; i++) {
      if (U.safe(users[i].name).toLowerCase() === U.safe(user).toLowerCase()) {
        return normalizeShift(users[i].shift || 'Turno 1');
      }
    }
    return 'Turno 1';
  }

  function getUsersForShift(shift) {
    var target = normalizeShift(shift);
    var users = S.rows('users', 'name');
    var out = [];
    for (var i = 0; i < users.length; i++) {
      if (normalizeShift(users[i].shift || 'Turno 1') === target) out.push(users[i]);
    }
    return out;
  }

  function getPendingForShift(shift) {
    var target = normalizeShift(shift);
    return getShiftOrders({ status: 'PENDIENTE', toShift: target });
  }

  function getOpenForShift(shift) {
    var target = normalizeShift(shift);
    return getShiftOrders({ openOnly: true, toShift: target });
  }

  function acceptShiftOrder(orderId, user) {
    return setFields(TABLE, orderId, {
      status: 'EN_PROCESO',
      assignedTo: U.safe(user),
      acceptedAt: now(),
      updatedAt: now()
    }).then(function () { return getOrder(orderId); });
  }

  function completeShiftOrder(orderId, user, notes) {
    return setFields(TABLE, orderId, {
      status: 'COMPLETADA',
      assignedTo: U.safe(user),
      completedAt: now(),
      completionNotes: U.safe(notes),
      updatedAt: now()
    }).then(function () { return getOrder(orderId); });
  }

  function rejectShiftOrder(orderId, user, reason) {
    return setFields(TABLE, orderId, {
      status: 'RECHAZADA',
      rejectionReason: U.safe(reason),
      updatedAt: now()
    }).then(function () {
      var o = getOrder(orderId);
      if (o) return setFields(TABLE, orderId, { assignedTo: U.safe(user) });
      return null;
    }).then(function () { return getOrder(orderId); });
  }

  function cancelShiftOrder(orderId, user) {
    return setFields(TABLE, orderId, {
      status: 'CANCELADA',
      updatedAt: now()
    }).then(function () { return getOrder(orderId); });
  }

  function reassignShiftOrder(orderId, shift) {
    return setFields(TABLE, orderId, {
      toShift: normalizeShift(shift),
      status: 'PENDIENTE',
      assignedTo: '',
      acceptedAt: null,
      updatedAt: now()
    }).then(function () { return getOrder(orderId); });
  }

  /* Mueve las órdenes abiertas que atiende un turno al siguiente (entrega de turno).
     El filtro es por turno destino: lo que el turno tiene en su bandeja. */
  function transferOpenOrders(fromShift, toShift, onlyIds) {
    var current = normalizeShift(fromShift);
    var target = toShift ? normalizeShift(toShift) : nextShift(current);
    var list = getShiftOrders({ openOnly: true, toShift: current });
    var moved = [];
    for (var i = 0; i < list.length; i++) {
      if (onlyIds && onlyIds.length && onlyIds.indexOf(list[i].id) < 0) continue;
      moved.push(list[i].id);
    }
    var chain = Promise.resolve();
    moved.forEach(function (id) {
      chain = chain.then(function () {
        return setFields(TABLE, id, {
          fromShift: current,
          toShift: target,
          fromDate: today(),
          toDate: today(),
          updatedAt: now()
        });
      });
    });
    return chain.then(function () { return { moved: moved, toShift: target, fromShift: current }; });
  }

  /* ======================= entregas de turno ======================= */
  function createHandoff(data) {
    var from = normalizeShift(data.fromShift);
    var to = data.toShift ? normalizeShift(data.toShift) : nextShift(from);
    var ids = [];
    var orders = data.orders || [];
    for (var i = 0; i < orders.length; i++) {
      ids.push(typeof orders[i] === 'string' ? orders[i] : U.safe(orders[i].id));
    }
    var handoff = {
      id: uuid(),
      date: formatDate(data.date || today()),
      fromShift: from,
      toShift: to,
      fromUser: U.safe(data.fromUser),
      toUser: U.safe(data.toUser),
      orders: ids,
      notes: U.safe(data.notes),
      createdAt: now()
    };
    return put(HANDOFF_TABLE, handoff).then(function () { return handoff; });
  }

  function getHandoffs(filter) {
    filter = filter || {};
    var list = rows(HANDOFF_TABLE);
    list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (filter.date) list = list.filter(function (h) { return h.date === filter.date; });
    if (filter.fromShift) list = list.filter(function (h) { return h.fromShift === normalizeShift(filter.fromShift); });
    if (filter.toShift) list = list.filter(function (h) { return h.toShift === normalizeShift(filter.toShift); });
    if (filter.fromUser) list = list.filter(function (h) { return h.fromUser === filter.fromUser; });
    if (filter.toUser) list = list.filter(function (h) { return h.toUser === filter.toUser; });
    return list;
  }

  function getTodaysHandoffs() { return getHandoffs({ date: today() }); }

  /* ======================= alertas ======================= */
  function getAlertsForUser(user) {
    if (!user) return [];
    var shift = getUserShift(user);
    var alerts = [];

    getShiftOrders({ status: 'PENDIENTE', toShift: shift }).forEach(function (o) {
      alerts.push({
        id: 'pend:' + o.id,
        type: 'PENDIENTE',
        title: 'Nueva orden de ' + o.fromShift,
        message: (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : '') + ' · ' + o.description,
        orderId: o.id,
        priority: o.priority,
        createdAt: o.createdAt,
        tone: o.priority === 'CRÍTICA' || o.priority === 'ALTA' ? 'high' : 'normal'
      });
    });

    getShiftOrders({ status: 'EN_PROCESO', assignedTo: user }).forEach(function (o) {
      alerts.push({
        id: 'proc:' + o.id,
        type: 'EN_PROCESO',
        title: 'Continuar orden en proceso',
        message: (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : '') + ' · ' + o.description,
        orderId: o.id,
        priority: o.priority,
        createdAt: o.acceptedAt || o.createdAt,
        tone: 'normal'
      });
    });

    alerts.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return alerts;
  }

  function readSet() {
    try { return JSON.parse(S.setting('shift-alerts-read') || '[]'); } catch (e) { return []; }
  }

  function markAlertRead(alertId) {
    var read = readSet();
    if (read.indexOf(alertId) < 0) read.push(alertId);
    if (read.length > 400) read = read.slice(-400);
    return S.set('shift-alerts-read', JSON.stringify(read));
  }

  function isAlertRead(alertId) { return readSet().indexOf(alertId) >= 0; }

  function unreadAlerts(user) {
    var list = getAlertsForUser(user);
    var out = [];
    for (var i = 0; i < list.length; i++) if (!isAlertRead(list[i].id)) out.push(list[i]);
    return out;
  }

  function stats(user) {
    var shift = user ? getUserShift(user) : 'Turno 1';
    var all = getShiftOrders({});
    var out = { total: all.length, pendiente: 0, proceso: 0, completada: 0, rechazada: 0, cancelada: 0, miTurno: 0, alertas: 0 };
    for (var i = 0; i < all.length; i++) {
      var st = all[i].status;
      if (st === 'PENDIENTE') out.pendiente++;
      else if (st === 'EN_PROCESO') out.proceso++;
      else if (st === 'COMPLETADA') out.completada++;
      else if (st === 'RECHAZADA') out.rechazada++;
      else if (st === 'CANCELADA') out.cancelada++;
      if ((st === 'PENDIENTE' || st === 'EN_PROCESO') && all[i].toShift === shift) out.miTurno++;
    }
    out.alertas = user ? unreadAlerts(user).length : 0;
    return out;
  }

  LG.shiftOrders = {
    TABLE: TABLE,
    HANDOFF_TABLE: HANDOFF_TABLE,
    TABLES: TABLES,
    SHIFTS: SHIFTS,
    ORDER_STATUSES: ORDER_STATUSES,
    PRIORITIES: PRIORITIES,

    today: today,
    now: now,
    uuid: uuid,
    normalizeShift: normalizeShift,
    nextShift: nextShift,
    prevShift: prevShift,
    shiftIndex: shiftIndex,
    formatDate: formatDate,

    rows: rows,
    put: put,
    remove: remove,
    update: update,

    createShiftOrder: createShiftOrder,
    getOrder: getOrder,
    getShiftOrders: getShiftOrders,
    getPendingForShift: getPendingForShift,
    getOpenForShift: getOpenForShift,
    getUserShift: getUserShift,
    getUsersForShift: getUsersForShift,

    acceptShiftOrder: acceptShiftOrder,
    completeShiftOrder: completeShiftOrder,
    rejectShiftOrder: rejectShiftOrder,
    cancelShiftOrder: cancelShiftOrder,
    reassignShiftOrder: reassignShiftOrder,
    transferOpenOrders: transferOpenOrders,

    createHandoff: createHandoff,
    getHandoffs: getHandoffs,
    getTodaysHandoffs: getTodaysHandoffs,

    getAlertsForUser: getAlertsForUser,
    unreadAlerts: unreadAlerts,
    markAlertRead: markAlertRead,
    isAlertRead: isAlertRead,
    stats: stats
  };
})();
