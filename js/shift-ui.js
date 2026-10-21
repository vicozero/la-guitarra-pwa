/* ShiftUI: pantalla de órdenes entre turnos + panel de administración.
   Se apoya en los widgets de LG.ui para conservar el estilo de la app. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});

  function SO() { return LG.shiftOrders; }
  function UI() { return LG.ui; }
  function S() { return LG.store; }
  function U() { return LG.util; }
  function A() { return LG.admin; }
  function MB() { return LG.maintenance; }

  /* ======================= utilidades visuales ======================= */

  function el(tag, cls) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    return d;
  }

  function pill(text, tone) {
    var s = el('span', 'pill' + (tone ? ' ' + tone : ''));
    s.textContent = text;
    return s;
  }

  function statusTone(status) {
    if (status === 'PENDIENTE') return 'warn';
    if (status === 'EN_PROCESO') return 'info';
    if (status === 'COMPLETADA') return 'ok';
    if (status === 'RECHAZADA') return 'bad';
    return 'muted';
  }

  function priorityTone(priority) {
    if (priority === 'CRÍTICA') return 'bad';
    if (priority === 'ALTA') return 'warn';
    if (priority === 'MEDIA') return 'info';
    return 'muted';
  }

  function shortDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  function sectionTitle(parent, text, sub) {
    var h = el('div', 'shift-section-title');
    UI().t(h, text, 17, UI().INK, true);
    if (sub) UI().t(h, sub, 12, UI().MUTED, false);
    parent.appendChild(h);
    return h;
  }

  function empty(parent, text) {
    var box = el('div', 'shift-empty');
    box.textContent = text;
    parent.appendChild(box);
    return box;
  }

  function guardLogin() {
    if (LG.app.user) return true;
    UI().toast('Inicia sesión con tu perfil para continuar');
    UI().profiles();
    return false;
  }

  function canAdmin() { return LG.app.role === 'Administrador'; }

  /* ======================= pantalla principal ======================= */

  function screen(main) {
    var so = SO(), u = UI();
    var user = LG.app.user;
    var role = LG.app.role;
    var myShift = user ? so.getUserShift(user) : so.SHIFTS[0];
    var stats = so.stats(user);

    /* Encabezado */
    var head = el('div', 'page-heading');
    u.t(head, 'Órdenes entre turnos', 26, u.INK, true);
    u.t(head, 'Turno 1 → Turno 2 → Turno 3 · entrega, seguimiento y envío a mantenimiento', 14, u.MUTED, false);
    main.appendChild(head);

    /* Tarjeta de identidad / turno */
    var idCard = u.card(main);
    idCard.classList.add('shift-id');
    var idTop = el('div', 'shift-id-top');
    u.t(idTop, user ? user : 'Sin sesión', 18, u.INK, true);
    idTop.appendChild(pill(myShift, 'green'));
    if (role) idTop.appendChild(pill(role, 'muted'));
    idCard.appendChild(idTop);
    u.t(idCard,
      user
        ? 'Tus alertas: ' + stats.alertas + ' · Órdenes activas para ' + myShift + ': ' + stats.miTurno
        : 'Inicia sesión para recibir las órdenes que deja el turno anterior.',
      13, u.MUTED, false);

    /* Acciones */
    var actions = el('div', 'shift-actions');
    idCard.appendChild(actions);

    u.btn(actions, '+ Nueva orden', true, function () { newOrderModal(); });
    u.btn(actions, 'Entregar turno', false, function () { handoffModal(); });
    u.btn(actions, 'Mantenimiento.exe', false, function () { maintenanceModal(); });
    if (canAdmin()) u.btn(actions, '⚙ Administración', false, function () { adminPanel(); });
    if (!user) u.btn(actions, 'Iniciar sesión', false, function () { u.profiles(); });

    /* Resumen */
    var grid = el('div', 'shift-stats');
    main.appendChild(grid);
    [
      ['Pendientes', stats.pendiente, 'warn'],
      ['En proceso', stats.proceso, 'info'],
      ['Completadas', stats.completada, 'ok'],
      ['Para ' + myShift, stats.miTurno, 'green']
    ].forEach(function (item) {
      var c = el('div', 'shift-stat');
      u.t(c, String(item[1]), 24, u.INK, true);
      u.t(c, item[0], 11, u.MUTED, false);
      c.classList.add(item[2]);
      grid.appendChild(c);
    });

    if (!user) {
      var signin = u.card(main);
      u.t(signin, 'Selecciona tu perfil', 16, u.INK, true);
      u.btn(signin, 'Abrir perfiles', true, function () { u.profiles(); });
      return;
    }

    /* Alertas sin leer */
    var alerts = so.unreadAlerts(user);
    if (alerts.length) {
      var banner = el('div', 'alert-banner');
      var bTop = el('div', 'alert-banner-head');
      u.t(bTop, '🔔 ' + alerts.length + ' alerta' + (alerts.length === 1 ? '' : 's') + ' para ti', 14, '#7a3d00', true);
      banner.appendChild(bTop);
      alerts.slice(0, 4).forEach(function (a) {
        var line = el('div', 'alert-line' + (a.tone === 'high' ? ' high' : ''));
        var info = el('div', 'alert-line-info');
        u.t(info, a.title, 13, '#5a2d00', true);
        u.t(info, a.message, 12, '#7a4a12', false);
        line.appendChild(info);
        var open = el('button', 'btn small');
        open.type = 'button';
        open.textContent = a.type === 'EN_PROCESO' ? 'Continuar' : 'Abrir';
        open.onclick = function () {
          so.markAlertRead(a.id);
          orderDetail(a.orderId);
        };
        line.appendChild(open);
        banner.appendChild(line);
      });
      main.appendChild(banner);
    }

    /* Pendientes para mi turno */
    var mine = so.getShiftOrders({ status: 'PENDIENTE', toShift: myShift });
    if (canAdmin()) mine = so.getShiftOrders({ status: 'PENDIENTE' });
    sectionTitle(main, canAdmin() ? 'Órdenes pendientes (todas)' : 'Pendientes para ' + myShift,
      mine.length ? mine.length + ' por atender' : 'Nada pendiente');
    if (!mine.length) empty(main, 'No hay órdenes pendientes. Puedes crear una nueva o entregar tu turno.');
    mine.forEach(function (o) { main.appendChild(orderCard(o, myShift)); });

    /* En proceso */
    var running = so.getShiftOrders({ status: 'EN_PROCESO' });
    if (running.length) {
      sectionTitle(main, 'En proceso', running.length + ' en seguimiento');
      running.forEach(function (o) { main.appendChild(orderCard(o, myShift)); });
    }

    /* Entregas de hoy */
    var handoffs = so.getTodaysHandoffs();
    sectionTitle(main, 'Entregas de turno de hoy', handoffs.length ? handoffs.length + ' registradas' : 'Sin entregas registradas');
    if (!handoffs.length) empty(main, 'Cuando cierres tu turno, usa «Entregar turno» para dejar las órdenes al siguiente.');
    handoffs.slice(0, 6).forEach(function (h) {
      var c = el('div', 'handoff-row');
      var l = el('div');
      UI().t(l, h.fromShift + ' → ' + h.toShift, 14, UI().INK, true);
      UI().t(l, (h.fromUser || '—') + ' · ' + (h.orders ? h.orders.length : 0) + ' orden(es)' + (h.notes ? ' · ' + h.notes : ''), 12, UI().MUTED, false);
      c.appendChild(l);
      UI().t(c, shortDate(h.createdAt), 11, UI().MUTED, false);
      main.appendChild(c);
    });

    /* Historial */
    var all = so.getShiftOrders({});
    var details = el('details', 'turn-details');
    var summary = el('summary');
    summary.textContent = 'Historial completo (' + all.length + ')';
    details.appendChild(summary);
    main.appendChild(details);
    var body = el('div');
    details.appendChild(body);
    if (!all.length) empty(body, 'Aún no hay órdenes registradas.');
    all.slice(0, 60).forEach(function (o) {
      var r = el('div', 'order-mini');
      var left = el('div');
      UI().t(left, (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : ''), 13, UI().INK, true);
      UI().t(left, o.description, 12, UI().MUTED, false);
      left.appendChild(pill(o.status, statusTone(o.status)));
      r.appendChild(left);
      var open = el('button', 'btn small');
      open.type = 'button';
      open.textContent = 'Ver';
      open.onclick = function () { orderDetail(o.id); };
      r.appendChild(open);
      body.appendChild(r);
    });
  }

  /* ======================= tarjeta de orden ======================= */

  function orderCard(o, myShift) {
    var u = UI(), so = SO();
    var c = el('div', 'order-card');

    var top = el('div', 'order-top');
    var title = el('div', 'order-title');
    u.t(title, (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : ''), 16, u.INK, true);
    title.appendChild(pill(o.priority, priorityTone(o.priority)));
    top.appendChild(title);
    top.appendChild(pill(o.status.replace('_', ' '), statusTone(o.status)));
    c.appendChild(top);

    u.t(c, o.description, 14, u.INK, false);
    if (o.details) u.t(c, o.details, 12, u.MUTED, false);

    var meta = el('div', 'order-meta');
    u.t(meta, o.fromShift + ' → ' + o.toShift, 12, u.GREEN, true);
    u.t(meta, 'Creada por ' + (o.createdBy || '—') + ' · ' + shortDate(o.createdAt), 11, u.MUTED, false);
    if (o.assignedTo) u.t(meta, 'Atiende: ' + o.assignedTo, 11, u.MUTED, false);
    c.appendChild(meta);

    var acts = el('div', 'order-actions');
    c.appendChild(acts);

    u.btn(acts, 'Ver', false, function () { orderDetail(o.id); }, 'small');

    if (o.status === 'PENDIENTE') {
      u.btn(acts, 'Aceptar', true, function () {
        so.acceptShiftOrder(o.id, LG.app.user).then(function () {
          so.markAlertRead('pend:' + o.id);
          MB().notifyOrderUpdate(o.id, 'EN_PROCESO');
          u.toast('Orden aceptada: ahora está en proceso');
          u.show(4);
        }).catch(u.error);
      }, 'small');

      u.btn(acts, 'Rechazar', false, function () { rejectPrompt(o.id); }, 'small');
    }

    if (o.status === 'EN_PROCESO') {
      u.btn(acts, 'Completar', true, function () { completePrompt(o.id); }, 'small');
      u.btn(acts, 'Derivar', false, function () { derivePrompt(o.id); }, 'small');
    }

    return c;
  }

  /* ======================= detalle / acciones ======================= */

  function orderDetail(orderId) {
    var so = SO(), u = UI();
    var o = so.getOrder(orderId);
    if (!o) { u.toast('La orden ya no existe'); return; }
    if (LG.app.user) so.markAlertRead('pend:' + o.id);

    var m = u.openModal('Orden de trabajo', { full: true });
    var c = u.card(m.content);
    var top = el('div', 'order-top');
    var title = el('div', 'order-title');
    u.t(title, (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : ''), 20, u.INK, true);
    title.appendChild(pill(o.priority, priorityTone(o.priority)));
    top.appendChild(title);
    top.appendChild(pill(o.status.replace('_', ' '), statusTone(o.status)));
    c.appendChild(top);

    var rows = [
      ['Descripción', o.description],
      ['Detalle', o.details],
      ['Turno origen', o.fromShift + ' · ' + o.fromDate],
      ['Turno destino', o.toShift + ' · ' + o.toDate],
      ['Creada por', (o.createdBy || '—') + ' · ' + shortDate(o.createdAt)],
      ['Atiende', o.assignedTo || 'Sin asignar'],
      ['Aceptada', o.acceptedAt ? shortDate(o.acceptedAt) : '—'],
      ['Completada', o.completedAt ? shortDate(o.completedAt) : '—'],
      ['Notas de cierre', o.completionNotes],
      ['Motivo de rechazo', o.rejectionReason]
    ];
    rows.forEach(function (r) {
      if (!r[1]) return;
      var line = el('div', 'detail-line');
      u.t(line, r[0], 11, u.MUTED, true);
      u.t(line, r[1], 14, u.INK, false);
      c.appendChild(line);
    });

    var acts = el('div', 'modal-actions');
    c.appendChild(acts);

    if (o.status === 'PENDIENTE') {
      u.btn(acts, 'Aceptar y continuar', true, function () {
        so.acceptShiftOrder(o.id, LG.app.user).then(function () {
          m.close();
          MB().notifyOrderUpdate(o.id, 'EN_PROCESO');
          u.toast('Orden en proceso');
          u.show(4);
        }).catch(u.error);
      });
      u.btn(acts, 'Rechazar', false, function () { m.close(); rejectPrompt(o.id); });
    }

    if (o.status === 'EN_PROCESO') {
      u.btn(acts, 'Completar orden', true, function () { m.close(); completePrompt(o.id); });
      u.btn(acts, 'Derivar a otro turno', false, function () { m.close(); derivePrompt(o.id); });
      u.btn(acts, 'Agregar avance', false, function () { m.close(); progressPrompt(o.id); });
    }

    if (o.status === 'PENDIENTE' || o.status === 'EN_PROCESO') {
      u.btn(acts, 'Crear orden relacionada', false, function () {
        m.close();
        newOrderModal({ equipment: o.equipment, eco: o.eco, equipmentId: o.equipmentId, parentOrderId: o.id });
      });
      u.btn(acts, 'Cancelar orden', false, function () {
        u.alertDialog({
          title: 'Cancelar orden',
          message: 'La orden quedará marcada como cancelada y saldrá de los pendientes.',
          positive: 'Cancelar orden', negative: 'Volver',
          onPositive: function () {
            so.cancelShiftOrder(o.id).then(function () {
              MB().notifyOrderUpdate(o.id, 'CANCELADA');
              u.toast('Orden cancelada');
              u.show(4);
            }).catch(u.error);
          }
        });
      });
    }

    if (canAdmin() && (o.status === 'COMPLETADA' || o.status === 'RECHAZADA' || o.status === 'CANCELADA')) {
      u.btn(acts, 'Reabrir', false, function () {
        so.update(so.TABLE, o.id, 'status', 'PENDIENTE').then(function () {
          m.close();
          u.toast('Orden reabierta');
          u.show(4);
        }).catch(u.error);
      });
    }

    u.btn(acts, 'Cerrar', false, function () { m.close(); });
  }

  function rejectPrompt(orderId) {
    var u = UI(), so = SO();
    var m = u.openModal('Rechazar orden');
    u.t(m.content, 'Explica por qué no se puede atender en este turno.', 13, u.MUTED, false);
    var ta = el('textarea', 'field');
    ta.rows = 3;
    ta.placeholder = 'Motivo del rechazo';
    m.content.appendChild(ta);
    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Confirmar rechazo', true, function () {
      so.rejectShiftOrder(orderId, LG.app.user, ta.value).then(function () {
        m.close();
        MB().notifyOrderUpdate(orderId, 'RECHAZADA');
        u.toast('Orden rechazada');
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  function completePrompt(orderId) {
    var u = UI(), so = SO();
    var m = u.openModal('Completar orden');
    u.t(m.content, 'Registra el trabajo realizado. Quedará en el historial y en el archivo para mantenimiento.exe.', 13, u.MUTED, false);
    var ta = el('textarea', 'field');
    ta.rows = 4;
    ta.placeholder = 'Trabajo realizado, refacciones, observaciones…';
    m.content.appendChild(ta);
    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Marcar completada', true, function () {
      so.completeShiftOrder(orderId, LG.app.user, ta.value).then(function () {
        m.close();
        MB().notifyOrderUpdate(orderId, 'COMPLETADA');
        u.toast('Orden completada');
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  function progressPrompt(orderId) {
    var u = UI(), so = SO();
    var o = so.getOrder(orderId);
    var m = u.openModal('Agregar avance');
    var ta = el('textarea', 'field');
    ta.rows = 4;
    ta.value = o && o.details ? o.details : '';
    m.content.appendChild(ta);
    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Guardar avance', true, function () {
      so.update(so.TABLE, orderId, 'details', ta.value).then(function () {
        return so.update(so.TABLE, orderId, 'updatedAt', Date.now());
      }).then(function () {
        MB().notifyOrderUpdate(orderId, 'EN_PROCESO');
        m.close();
        u.toast('Avance guardado');
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  function derivePrompt(orderId) {
    var u = UI(), so = SO();
    var o = so.getOrder(orderId);
    if (!o) return;
    var m = u.openModal('Derivar a otro turno');
    u.t(m.content, 'Se creará una nueva orden para el turno elegido y la actual quedará completada como derivada.', 13, u.MUTED, false);
    var target = u.spinner(m.content, 'Turno destino', so.SHIFTS, so.nextShift(o.toShift));
    var note = el('textarea', 'field');
    note.rows = 3;
    note.placeholder = 'Indicaciones para el siguiente turno';
    m.content.appendChild(note);
    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Derivar', true, function () {
      so.createShiftOrder({
        fromShift: o.toShift,
        toShift: target.value,
        equipmentId: o.equipmentId,
        equipment: o.equipment,
        eco: o.eco,
        description: o.description,
        details: (o.details ? o.details + '\n' : '') + (note.value || ''),
        priority: o.priority,
        createdBy: LG.app.user,
        parentOrderId: o.id
      }).then(function (created) {
        return so.completeShiftOrder(o.id, LG.app.user, 'Derivada a ' + created.toShift + '. ' + (note.value || ''));
      }).then(function () {
        MB().notifyOrderUpdate(orderId, 'COMPLETADA');
        m.close();
        u.toast('Orden derivada');
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  /* ======================= nueva orden ======================= */

  function newOrderModal(preset) {
    preset = preset || {};
    var u = UI(), so = SO();
    if (!guardLogin()) return;

    var myShift = so.getUserShift(LG.app.user);
    var m = u.openModal('Nueva orden de trabajo', { full: true });
    u.t(m.content, 'Se enviará al turno que elijas y quedará disponible para mantenimiento.exe.', 13, u.MUTED, false);

    var equipment = S().initialized() ? S().current() : [];
    var labels = ['— Equipo del catálogo —'];
    var index = {};
    equipment.forEach(function (eq, i) {
      var label = U().safe(eq.equipo) + (U().safe(eq.eco) ? ' #' + U().safe(eq.eco) : '');
      if (index[label] == null) index[label] = i;
      labels.push(label);
    });

    var preselected = '— Equipo del catálogo —';
    if (preset.equipment) {
      var guess = preset.equipment + (preset.eco ? ' #' + preset.eco : '');
      if (index[guess] != null) preselected = guess;
      else {
        labels.push(guess);
        index[guess] = -1;
        preselected = guess;
      }
    }

    var eqPick = u.spinner(m.content, 'Equipo', labels, preselected);
    var eco = u.field(m.content, 'Número económico', preset.eco || '', false);
    var desc = u.field(m.content, 'Descripción breve', preset.description || '', false);
    u.t(m.content, 'Detalle del trabajo', 12, u.MUTED, true, 'label');
    var details = el('textarea', 'field');
    details.rows = 3;
    details.value = preset.details || '';
    details.placeholder = 'Falla, trabajo solicitado, refacciones, condiciones…';
    m.content.appendChild(details);

    var prio = u.spinner(m.content, 'Prioridad', so.PRIORITIES, 'MEDIA');
    var target = u.spinner(m.content, 'Turno destino', so.SHIFTS, so.nextShift(myShift));
    u.t(m.content, 'Turno origen: ' + myShift + ' · creada por ' + LG.app.user, 12, u.GREEN, true);

    eqPick.onchange = function () {
      var i = index[eqPick.value];
      if (i == null || i < 0) return;
      eco.value = U().safe(equipment[i].eco);
      if (!desc.value) desc.value = 'Mantenimiento ' + U().safe(equipment[i].equipo);
    };

    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Crear y enviar', true, function () {
      if (U().safe(desc.value).trim() === '') { u.toast('Escribe una descripción'); return; }
      var eq = index[eqPick.value] != null && index[eqPick.value] >= 0 ? equipment[index[eqPick.value]] : null;
      so.createShiftOrder({
        fromShift: myShift,
        toShift: target.value,
        equipmentId: eq ? U().safe(eq.id) : '',
        equipment: eq ? U().safe(eq.equipo) : eqPick.value,
        eco: eco.value,
        description: desc.value,
        details: details.value,
        priority: prio.value,
        createdBy: LG.app.user,
        parentOrderId: preset.parentOrderId || ''
      }).then(function (order) {
        if (A()) A().logAudit('crear_orden', order.equipment + ' ' + order.eco + ' · ' + order.fromShift + '→' + order.toShift);
        MB().notifyNewOrder(order);
        m.close();
        u.toast('Orden creada para ' + order.toShift);
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  /* ======================= entrega de turno ======================= */

  function handoffModal() {
    var u = UI(), so = SO();
    if (!guardLogin()) return;

    var myShift = so.getUserShift(LG.app.user);
    var next = so.nextShift(myShift);
    var open = so.getOpenForShift(myShift);

    var m = u.openModal('Entregar turno · ' + myShift + ' → ' + next, { full: true });
    u.t(m.content, 'Pasa tus órdenes abiertas al siguiente turno y deja una nota de entrega.', 13, u.MUTED, false);

    var list = u.card(m.content);
    u.t(list, open.length + ' orden(es) abiertas en la bandeja de ' + myShift, 15, u.INK, true);
    if (!open.length) u.t(list, 'No hay órdenes abiertas: la entrega quedará registrada sin órdenes.', 12, u.MUTED, false);
    open.forEach(function (o) {
      var line = el('div', 'handoff-item');
      var l = el('div');
      u.t(l, (o.equipment || 'Equipo') + (o.eco ? ' #' + o.eco : ''), 13, u.INK, true);
      u.t(l, o.description + ' · ' + o.status.replace('_', ' '), 12, u.MUTED, false);
      line.appendChild(l);
      line.appendChild(pill(o.priority, priorityTone(o.priority)));
      list.appendChild(line);
    });

    var target = u.spinner(m.content, 'Entregar a', so.SHIFTS, next);
    u.t(m.content, 'Nota de entrega', 12, u.MUTED, true, 'label');
    var notes = el('textarea', 'field');
    notes.rows = 3;
    notes.placeholder = 'Pendientes, riesgos, refacciones, indicaciones…';
    m.content.appendChild(notes);

    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Confirmar entrega', true, function () {
      var ids = open.map(function (o) { return o.id; });
      so.transferOpenOrders(myShift, target.value).then(function (res) {
        return so.createHandoff({
          fromShift: myShift,
          toShift: target.value,
          fromUser: LG.app.user,
          orders: ids,
          notes: notes.value
        }).then(function (h) { return { moved: res.moved.length, handoff: h }; });
      }).then(function (res) {
        if (A()) A().logAudit('entrega_turno', myShift + '→' + target.value + ' · ' + res.moved + ' órdenes');
        return MB().exportOrders().then(function () { return res; }, function () { return res; });
      }).then(function (res) {
        m.close();
        u.toast('Entrega registrada: ' + res.moved + ' orden(es) a ' + target.value);
        u.show(4);
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  /* ======================= mantenimiento.exe ======================= */

  function maintenanceModal() {
    var u = UI(), mb = MB();
    var m = u.openModal('Envío a mantenimiento.exe', { full: true });
    var body = el('div');
    m.content.appendChild(body);

    function repaint() {
      body.innerHTML = '';
      mb.status().then(function (st) {
        var c = u.card(body);
        u.t(c, 'Estado del puente', 16, u.INK, true);
        u.t(c, st.linked
          ? 'Carpeta vinculada: ' + st.folder
          : 'Sin carpeta vinculada. Puedes descargar el archivo y colocarlo en la carpeta que vigila mantenimiento.exe.',
          13, u.MUTED, false);
        u.t(c, 'Órdenes abiertas: ' + mb.pendingCount() + ' · Último envío: ' + (st.lastExport ? shortDate(new Date(st.lastExport).getTime()) : '—'), 12, u.MUTED, false);
        if (st.auto) u.t(c, 'Envío automático cada ' + st.interval + ' min', 12, u.GREEN, true);

        var acts = el('div', 'modal-actions');
        c.appendChild(acts);

        u.btn(acts, 'Exportar ahora', true, function () {
          mb.exportOrders().then(function () {
            u.toast('Órdenes exportadas');
            repaint();
          }).catch(function (err) { u.toast(err.message || 'No se pudo exportar'); });
        });

        u.btn(acts, 'Descargar JSON', false, function () {
          mb.downloadOrders().then(function () {
            u.toast('Archivo ' + mb.EXPORT_FILE + ' descargado');
          }).catch(u.error);
        });

        u.btn(acts, 'Importar archivo…', false, function () { pickImport(); });

        u.btn(acts, 'Importar de carpeta', false, function () {
          mb.importFromLinkedFolder().then(function (r) {
            u.toast('Importadas ' + r.imported + ' · actualizadas ' + r.updated);
            LG.ui.show(4);
            m.close();
          }).catch(function (err) { u.toast(err.message || 'No se pudo importar'); });
        });

        if (mb.supportsFolder()) {
          u.btn(acts, st.linked ? 'Cambiar carpeta' : 'Vincular carpeta', false, function () {
            mb.linkFolder().then(function (name) {
              u.toast('Carpeta vinculada: ' + name);
              return mb.exportOrders();
            }).then(function () { repaint(); })
              .catch(function (err) { u.toast(err.message || 'No se vinculó la carpeta'); });
          });
          if (st.linked) {
            u.btn(acts, 'Desvincular', false, function () {
              mb.unlinkFolder().then(function () { u.toast('Carpeta desvinculada'); repaint(); });
            });
          }
        }

        var auto = u.spinner(c, 'Envío automático', ['Desactivado', 'Cada 5 minutos', 'Cada 10 minutos', 'Cada 30 minutos'],
          !st.auto ? 'Desactivado' : st.interval === 10 ? 'Cada 10 minutos' : st.interval === 30 ? 'Cada 30 minutos' : 'Cada 5 minutos');
        auto.onchange = function () {
          if (auto.value === 'Desactivado') { mb.stopAutoExport().then(repaint); return; }
          var mins = auto.value === 'Cada 30 minutos' ? 30 : auto.value === 'Cada 10 minutos' ? 10 : 5;
          mb.startAutoExport(mins).then(function () { u.toast('Envío automático activo'); repaint(); });
        };

        var help = u.card(body);
        u.t(help, 'Cómo lo lee mantenimiento.exe', 15, u.INK, true);
        u.t(help,
          '1. La PWA escribe ' + mb.EXPORT_FILE + ' con todas las órdenes y ' + mb.WATCH_FILE + ' como señal.\n' +
          '2. mantenimiento.exe revisa esa carpeta y muestra la alerta.\n' +
          '3. Al cerrar o crear una orden, el programa deja ' + mb.IMPORT_FILE + '.\n' +
          '4. Aquí usa «Importar de carpeta» para traer los cambios de vuelta.',
          12, u.MUTED, false);

        var net = u.card(body);
        u.t(net, 'Envío por red (opcional)', 15, u.INK, true);
        u.t(net, 'Si la aplicación de mantenimiento expone un servicio HTTP, aquí se envían y reciben las órdenes sin carpetas.', 12, u.MUTED, false);
        var urlField = u.field(net, 'Dirección del servicio', st.url || '', false);
        urlField.placeholder = 'http://127.0.0.1:8765/api/work-orders';
        var keyField = u.field(net, 'Clave de API', st.hasKey ? '••••••••' : '', false);
        var netActs = el('div', 'modal-actions');
        net.appendChild(netActs);
        u.btn(netActs, 'Guardar dirección', false, function () {
          var key = keyField.value === '••••••••' ? mb.endpointConfig().key : keyField.value;
          mb.saveEndpointConfig(urlField.value, key).then(function () {
            u.toast('Dirección guardada');
            repaint();
          });
        });
        u.btn(netActs, 'Enviar ahora', true, function () {
          var key = keyField.value === '••••••••' ? mb.endpointConfig().key : keyField.value;
          mb.saveEndpointConfig(urlField.value, key).then(function () {
            return mb.pushToEndpoint();
          }).then(function () {
            u.toast('Órdenes enviadas al servicio');
          }).catch(function (err) { u.toast(err.message || 'No se pudo enviar'); });
        });
        u.btn(netActs, 'Recibir del servicio', false, function () {
          var key = keyField.value === '••••••••' ? mb.endpointConfig().key : keyField.value;
          mb.saveEndpointConfig(urlField.value, key).then(function () {
            return mb.pullFromEndpoint();
          }).then(function (r) {
            u.toast('Importadas ' + r.imported + ' · actualizadas ' + r.updated);
            m.close();
            LG.ui.show(4);
          }).catch(function (err) { u.toast(err.message || 'No se pudo recibir'); });
        });

        var input = el('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        body.appendChild(input);
        input.onchange = function () {
          var f = input.files && input.files[0];
          if (!f) return;
          mb.importFile(f).then(function (r) {
            u.toast('Importadas ' + r.imported + ' · actualizadas ' + r.updated);
            LG.ui.show(4);
            m.close();
          }).catch(function (err) { u.toast(err.message || 'Archivo inválido'); });
        };
        body._pick = function () { input.click(); };
      });
    }

    function pickImport() { if (body._pick) body._pick(); }
    repaint();
  }

  /* ======================= panel de administración ======================= */

  function adminPanel() {
    var u = UI();
    if (!canAdmin()) { u.toast('Solo el administrador puede abrir este panel'); return; }

    var m = u.openModal('Panel de administración', { full: true });
    var body = el('div');
    m.content.appendChild(body);

    function repaint() {
      body.innerHTML = '';
      var admin = A();
      var users = admin.getUsers();

      var head = u.card(body);
      u.t(head, 'Usuarios y turnos', 17, u.INK, true);
      u.t(head, users.length + ' perfiles en este dispositivo', 12, u.MUTED, false);
      u.btn(head, '+ Nuevo supervisor', true, function () { createUserModal(repaint); });

      users.forEach(function (p) {
        var row = el('div', 'admin-user');
        var info = el('div', 'admin-user-info');
        var nameRow = el('div', 'admin-user-name');
        u.t(nameRow, p.name, 14, u.INK, true);
        nameRow.appendChild(pill(p.role, p.role === 'Administrador' ? 'green' : 'muted'));
        nameRow.appendChild(pill(so().normalizeShift(p.shift || 'Turno 1'), 'info'));
        info.appendChild(nameRow);
        info.appendChild(u.t(info, 'PIN protegido · creado ' + shortDate(p.createdAt), 11, u.MUTED, false));
        row.appendChild(info);

        var acts = el('div', 'admin-user-actions');
        var shiftBtn = el('button', 'btn small');
        shiftBtn.type = 'button';
        shiftBtn.textContent = 'Turno';
        shiftBtn.onclick = function () {
          var next = so().nextShift(p.shift || 'Turno 1');
          admin.assignShift(p.id, next).then(function () {
            u.toast(p.name + ' → ' + next);
            repaint();
          }).catch(u.error);
        };
        acts.appendChild(shiftBtn);

        var pinBtn = el('button', 'btn small');
        pinBtn.type = 'button';
        pinBtn.textContent = 'PIN';
        pinBtn.onclick = function () { changePinModal(p, repaint); };
        acts.appendChild(pinBtn);

        if (p.name !== 'admin') {
          var del = el('button', 'btn small danger');
          del.type = 'button';
          del.textContent = 'Eliminar';
          del.onclick = function () {
            u.alertDialog({
              title: 'Eliminar usuario',
              message: 'Se eliminará el perfil ' + p.name + '. Sus órdenes se conservan.',
              positive: 'Eliminar', negative: 'Cancelar',
              onPositive: function () {
                admin.deleteUser(p.id).then(function () {
                  admin.logAudit('eliminar_usuario', p.name);
                  u.toast('Usuario eliminado');
                  repaint();
                }).catch(u.error);
              }
            });
          };
          acts.appendChild(del);
        }
        row.appendChild(acts);
        head.appendChild(row);
      });

      var info = u.card(body);
      u.t(info, 'Órdenes y alertas', 16, u.INK, true);
      var st = so().stats(LG.app.user);
      u.t(info, 'Pendientes ' + st.pendiente + ' · En proceso ' + st.proceso + ' · Completadas ' + st.completada +
        ' · Rechazadas ' + st.rechazada + ' · Total ' + st.total, 12, u.MUTED, false);
      var acts2 = el('div', 'modal-actions');
      info.appendChild(acts2);
      u.btn(acts2, 'Ver tablero', false, function () { m.close(); u.show(4); });
      u.btn(acts2, 'Nueva orden', true, function () { m.close(); newOrderModal(); });

      var maint = u.card(body);
      u.t(maint, 'mantenimiento.exe', 16, u.INK, true);
      MB().status().then(function (s) {
        u.t(maint, s.linked ? 'Carpeta vinculada: ' + s.folder : 'Sin carpeta vinculada (usa descarga/importación)', 12, s.linked ? u.GREEN : u.MUTED, false);
      });
      u.btn(maint, 'Configurar envío', false, function () { m.close(); maintenanceModal(); });

      var audit = u.card(body);
      u.t(audit, 'Auditoría reciente', 16, u.INK, true);
      var log = admin.getAuditLog().slice(0, 12);
      if (!log.length) u.t(audit, 'Sin movimientos registrados.', 12, u.MUTED, false);
      log.forEach(function (e) {
        u.t(audit, shortDate(e.timestamp) + ' · ' + e.action + ' · ' + (e.details || ''), 11, u.MUTED, false);
      });

      var backup = u.card(body);
      u.t(backup, 'Respaldo completo', 16, u.INK, true);
      u.t(backup, 'Descarga un ZIP con datos, órdenes, entregas y evidencias.', 12, u.MUTED, false);
      u.btn(backup, 'Descargar respaldo', false, function () {
        var busy = u.busyOverlay('Generando respaldo…');
        admin.createFullBackup().then(function (blob) {
          LG.reports.download(blob, 'La-Guitarra-respaldo-' + U().today() + '.zip', 'application/zip');
          busy.remove();
          u.toast('Respaldo descargado');
        }).catch(function (err) { busy.remove(); u.error(err); });
      });

      var about = u.card(body);
      u.t(about, 'Sesión', 16, u.INK, true);
      u.t(about, (LG.app.user || '—') + ' · ' + (LG.app.role || '—') + ' · ' + so().getUserShift(LG.app.user), 12, u.MUTED, false);
      u.btn(about, 'Cerrar sesión', false, function () {
        LG.app.user = ''; LG.app.role = '';
        m.close(); u.show(0); u.profiles();
      });
    }

    function so() { return SO(); }
    repaint();
  }

  function createUserModal(onDone) {
    var u = UI(), admin = A();
    var m = u.openModal('Nuevo usuario');
    var name = u.field(m.content, 'Nombre', '', false);
    var pin = u.field(m.content, 'PIN o contraseña', '', true); pin.type = 'password';
    var confirm = u.field(m.content, 'Confirmar', '', true); confirm.type = 'password';
    var role = u.spinner(m.content, 'Rol', ['Supervisor', 'Mecánico', 'Administrador'], 'Supervisor');
    var shift = u.spinner(m.content, 'Turno', SO().SHIFTS, 'Turno 1');

    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Crear usuario', true, function () {
      var n = name.value.trim();
      var p = pin.value;
      if (n === '') { u.toast('Escribe un nombre'); return; }
      if (p.length < 4) { u.toast('El PIN debe tener al menos 4 caracteres'); return; }
      if (p !== confirm.value) { u.toast('Los PIN no coinciden'); return; }
      var users = admin.getUsers();
      for (var i = 0; i < users.length; i++) {
        if (U().safe(users[i].name).toLowerCase() === n.toLowerCase()) { u.toast('Ese nombre ya existe'); return; }
      }
      admin.createUser(n, p, role.value, shift.value).then(function () {
        admin.logAudit('crear_usuario', n + ' · ' + role.value + ' · ' + shift.value);
        m.close();
        u.toast('Usuario ' + n + ' creado');
        if (onDone) onDone();
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  function changePinModal(user, onDone) {
    var u = UI(), admin = A();
    var m = u.openModal('Cambiar PIN · ' + user.name);
    var pin = u.field(m.content, 'Nuevo PIN', '', true); pin.type = 'password';
    var confirm = u.field(m.content, 'Confirmar PIN', '', true); confirm.type = 'password';
    var acts = el('div', 'modal-actions');
    m.content.appendChild(acts);
    u.btn(acts, 'Guardar', true, function () {
      if (pin.value.length < 4) { u.toast('Usa al menos 4 caracteres'); return; }
      if (pin.value !== confirm.value) { u.toast('Los PIN no coinciden'); return; }
      admin.changePin(user.id, pin.value).then(function () {
        admin.logAudit('cambiar_pin', user.name);
        m.close();
        u.toast('PIN actualizado');
        if (onDone) onDone();
      }).catch(u.error);
    });
    u.btn(acts, 'Cancelar', false, function () { m.close(); });
  }

  /* ======================= insignia para la barra inferior ======================= */

  function badgeCount() {
    if (!LG.app.user || !LG.shiftOrders) return 0;
    try { return SO().unreadAlerts(LG.app.user).length; } catch (e) { return 0; }
  }

  LG.shiftUI = {
    screen: screen,
    newOrderModal: newOrderModal,
    orderDetail: orderDetail,
    handoffModal: handoffModal,
    maintenanceModal: maintenanceModal,
    adminPanel: adminPanel,
    badgeCount: badgeCount
  };
})();
