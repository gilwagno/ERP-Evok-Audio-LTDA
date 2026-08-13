'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingService } = require('../src/bookingService');

// TC-SIM-001 — REQ-SIM-001 / AC-SIM-001
test('TC-SIM-001: cria reserva valida com id unico e status active', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  assert.ok(booking.id, 'reserva deve receber um id');
  assert.equal(booking.status, 'active');
  assert.equal(booking.roomId, 'room-a');
  assert.equal(booking.userId, 'user-1');
  assert.equal(booking.price, 100);

  const other = service.createBooking({
    roomId: 'room-b',
    userId: 'user-2',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 50,
  });
  assert.notEqual(other.id, booking.id, 'ids devem ser unicos');
});

test('TC-SIM-001b: rejeita reserva com start >= end', () => {
  const service = createBookingService();
  assert.throws(
    () =>
      service.createBooking({
        roomId: 'room-a',
        userId: 'user-1',
        start: '2026-09-01T12:00:00Z',
        end: '2026-09-01T10:00:00Z',
        price: 100,
      }),
    /start must be before end/
  );
});

// TC-SIM-004 — REQ-SIM-004 / AC-SIM-004
test('TC-SIM-004: lista apenas reservas ativas da sala consultada', () => {
  const service = createBookingService();

  const b1 = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T08:00:00Z',
    end: '2026-09-01T09:00:00Z',
    price: 30,
  });
  service.createBooking({
    roomId: 'room-b',
    userId: 'user-2',
    start: '2026-09-01T08:00:00Z',
    end: '2026-09-01T09:00:00Z',
    price: 30,
  });
  const b3 = service.createBooking({
    roomId: 'room-a',
    userId: 'user-3',
    start: '2026-09-01T09:00:00Z',
    end: '2026-09-01T10:00:00Z',
    price: 30,
  });

  service.cancelBooking({
    bookingId: b3.id,
    userId: 'user-3',
    userRole: 'user',
    now: '2026-08-20T00:00:00Z',
  });

  const list = service.listBookings('room-a');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, b1.id);
});

// TC-SIM-002 — REQ-SIM-002 / AC-SIM-002 (cancelamento antecipado, sem taxa)
test('TC-SIM-002: cancelamento com 24h ou mais de antecedencia nao cobra taxa', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  const result = service.cancelBooking({
    bookingId: booking.id,
    userId: 'user-1',
    userRole: 'user',
    now: '2026-09-08T10:00:00Z',
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.fee, 0);
});

// TC-SIM-002b — REQ-SIM-002 / AC-SIM-002 (cancelamento tardio, com taxa)
test('TC-SIM-002b: cancelamento com menos de 24h de antecedencia cobra taxa de 20%', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  const result = service.cancelBooking({
    bookingId: booking.id,
    userId: 'user-1',
    userRole: 'user',
    now: '2026-09-09T18:00:00Z',
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.fee, 40);
});

// TC-SIM-005 — BR-SIM-001 / FIND-SIM-001-001 (RETEST_SPECIFICATION item a)
test('TC-SIM-005: nao-dono sem papel admin nao consegue cancelar reserva de outro usuario (BR-SIM-001)', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  assert.throws(
    () =>
      service.cancelBooking({
        bookingId: booking.id,
        userId: 'user-2',
        userRole: 'user',
        now: '2026-09-08T10:00:00Z',
      }),
    /not authorized/
  );

  const list = service.listBookings('room-a');
  assert.equal(list.length, 1, 'reserva deve permanecer active');
  assert.equal(list[0].status, 'active');
});

// TC-SIM-006 — BR-SIM-001 (RETEST_SPECIFICATION item b)
test('TC-SIM-006: dono consegue cancelar a propria reserva (BR-SIM-001)', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  const result = service.cancelBooking({
    bookingId: booking.id,
    userId: 'user-1',
    userRole: 'user',
    now: '2026-09-08T10:00:00Z',
  });

  assert.equal(result.status, 'cancelled');
});

// TC-SIM-007 — BR-SIM-001 (RETEST_SPECIFICATION item c): admin cancela
// reserva de terceiro. Cenario reprovado no reteste da v1; coberto na v2.
test('TC-SIM-007: admin consegue cancelar reserva de outro usuario (BR-SIM-001)', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  const result = service.cancelBooking({
    bookingId: booking.id,
    userId: 'user-99',
    userRole: 'admin',
    now: '2026-09-08T10:00:00Z',
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.fee, 0);
  assert.equal(booking.status, 'cancelled', 'reserva deve virar cancelled');
  assert.equal(booking.cancellation.cancelledBy, 'user-99');
  assert.equal(booking.cancellation.cancelledByRole, 'admin');

  const list = service.listBookings('room-a');
  assert.equal(list.length, 0, 'reserva cancelada nao deve mais aparecer como ativa');
});

test('TC-SIM-002c: nao permite cancelar reserva ja cancelada', () => {
  const service = createBookingService();

  const booking = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 200,
  });

  service.cancelBooking({
    bookingId: booking.id,
    userId: 'user-1',
    userRole: 'user',
    now: '2026-09-01T10:00:00Z',
  });

  assert.throws(
    () =>
      service.cancelBooking({
        bookingId: booking.id,
        userId: 'user-1',
        userRole: 'user',
        now: '2026-09-01T11:00:00Z',
      }),
    /is not active/
  );
});
