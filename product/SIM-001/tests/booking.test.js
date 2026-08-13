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

// TC-SIM-003 — REQ-SIM-003 / AC-SIM-003 / BR-SIM-003 (nao sobreposicao)
test('TC-SIM-003a: rejeita reserva com sobreposicao parcial no inicio', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  assert.throws(
    () =>
      service.createBooking({
        roomId: 'room-a',
        userId: 'user-2',
        start: '2026-09-01T09:00:00Z',
        end: '2026-09-01T11:00:00Z',
        price: 100,
      }),
    /already booked/
  );
});

test('TC-SIM-003b: rejeita reserva com sobreposicao parcial no fim', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  assert.throws(
    () =>
      service.createBooking({
        roomId: 'room-a',
        userId: 'user-2',
        start: '2026-09-01T11:00:00Z',
        end: '2026-09-01T13:00:00Z',
        price: 100,
      }),
    /already booked/
  );
});

test('TC-SIM-003c: rejeita intervalo contido na reserva existente', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T14:00:00Z',
    price: 100,
  });

  assert.throws(
    () =>
      service.createBooking({
        roomId: 'room-a',
        userId: 'user-2',
        start: '2026-09-01T11:00:00Z',
        end: '2026-09-01T12:00:00Z',
        price: 100,
      }),
    /already booked/
  );
});

test('TC-SIM-003d: rejeita intervalo que contem a reserva existente', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T11:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  assert.throws(
    () =>
      service.createBooking({
        roomId: 'room-a',
        userId: 'user-2',
        start: '2026-09-01T10:00:00Z',
        end: '2026-09-01T14:00:00Z',
        price: 100,
      }),
    /already booked/
  );
});

test('TC-SIM-003e: aceita reserva adjacente [12:00,13:00) apos [10:00,12:00)', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  const adjacent = service.createBooking({
    roomId: 'room-a',
    userId: 'user-2',
    start: '2026-09-01T12:00:00Z',
    end: '2026-09-01T13:00:00Z',
    price: 100,
  });

  assert.equal(adjacent.status, 'active');
});

test('TC-SIM-003f: aceita a mesma janela de horario em sala diferente', () => {
  const service = createBookingService();

  service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  const otherRoom = service.createBooking({
    roomId: 'room-b',
    userId: 'user-2',
    start: '2026-09-01T10:00:00Z',
    end: '2026-09-01T12:00:00Z',
    price: 100,
  });

  assert.equal(otherRoom.status, 'active');
});

test('TC-SIM-003g: aceita reutilizar a janela de uma reserva ja cancelada', () => {
  const service = createBookingService();

  const original = service.createBooking({
    roomId: 'room-a',
    userId: 'user-1',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 100,
  });

  service.cancelBooking({
    bookingId: original.id,
    userId: 'user-1',
    userRole: 'user',
    now: '2026-09-01T00:00:00Z',
  });

  const reused = service.createBooking({
    roomId: 'room-a',
    userId: 'user-2',
    start: '2026-09-10T10:00:00Z',
    end: '2026-09-10T12:00:00Z',
    price: 100,
  });

  assert.equal(reused.status, 'active');
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
