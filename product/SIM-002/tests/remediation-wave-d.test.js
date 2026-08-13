'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext, claimedUser } = require('./support');
const { createGatewayClient } = require('../src/gatewayClient');

/**
 * Testes da WAVE-D — human gates APR-2026-007 / 008 / 009.
 *
 * Todos falham contra o código anterior à remediação:
 * - `cancelPayment` não recebia `user` e revertia `sent → created`;
 * - `createPayment` aceitava `analyst` e `sendPayment` não tinha sujeito;
 * - papel vinha do payload (não existia tabela `users`);
 * - recusa do gateway gravava `status = 'sent'`.
 */

function approvedSupplier(ctx, { cnpj = '44555666000133', creditLimit = 20000, companyId = ctx.companies.acme } = {}) {
  const supplier = ctx.suppliers.createSupplier({
    cnpj,
    name: 'Componentes Eletrônicos SA',
    companyId,
    user: ctx.user({ id: `cadastrador-${companyId}`, role: 'analyst', companyId })
  });

  return ctx.approvals.approveSupplier({
    supplierId: supplier.id,
    creditLimit,
    approver: ctx.user({ id: `gerson-${companyId}`, role: 'manager', companyId })
  });
}

function manager(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `marina-${companyId}`, role: 'manager', companyId });
}

function analyst(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `ana-${companyId}`, role: 'analyst', companyId });
}

function statusOf(ctx, paymentId) {
  return ctx.db.get('SELECT status FROM payments WHERE id = ?', paymentId).status;
}

// ---------------------------------------------------------------------------
// FIND-SIM-002-004 / APR-2026-007 — semântica de cancelPayment
// ---------------------------------------------------------------------------

test('TC-SIM2-007a: pagamento em created e cancelado (APR-2026-007)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 900,
      user: manager(ctx)
    });
    assert.strictEqual(payment.status, 'created');

    const cancelled = ctx.payments.cancelPayment({ paymentId: payment.id, user: manager(ctx) });

    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(statusOf(ctx, payment.id), 'cancelled');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-007b: cancelar pagamento ja enviado e RECUSADO e o status permanece sent (APR-2026-007)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 900,
      user: payer
    });
    const sent = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
    assert.strictEqual(sent.status, 'sent');

    assert.throws(
      () => ctx.payments.cancelPayment({ paymentId: payment.id, user: payer }),
      /estorno é operação distinta/
    );

    // Pós-condição relida do banco: o fato do envio permanece intacto.
    const after = ctx.db.get('SELECT * FROM payments WHERE id = ?', payment.id);
    assert.strictEqual(after.status, 'sent');
    assert.strictEqual(after.external_ref, sent.external_ref);
    assert.strictEqual(after.sent_at, sent.sent_at);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-007c: cancelPayment sem sujeito e recusado (FIND-SIM-002-004)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 120,
      user: manager(ctx)
    });

    assert.throws(
      () => ctx.payments.cancelPayment({ paymentId: payment.id }),
      /Usuário inválido/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-007d: cancelPayment cross-tenant e recusado (BR-SEC-001)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 700,
      user: manager(ctx)
    });

    const intruder = manager(ctx, ctx.companies.globex);

    assert.throws(
      () => ctx.payments.cancelPayment({ paymentId: payment.id, user: intruder }),
      /Pagamento não encontrado/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// FIND-SIM-002-008-A + OBS-002 / APR-2026-008 — matriz de papéis
// ---------------------------------------------------------------------------

test('TC-SIM2-008a: analista NAO registra pagamento; gerente registra (APR-2026-008)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);

    await assert.rejects(
      () => ctx.payments.createPayment({
        supplierId: supplier.id,
        amount: 500,
        user: analyst(ctx)
      }),
      /não possui permissão para registrar pagamentos/
    );

    const nothing = ctx.db.get(
      'SELECT COUNT(*) AS total FROM payments WHERE supplier_id = ?',
      supplier.id
    );
    assert.strictEqual(nothing.total, 0);

    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 500,
      user: manager(ctx)
    });
    assert.strictEqual(payment.status, 'created');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008b: analista NAO envia pagamento; gerente envia (APR-2026-008)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 500,
      user: manager(ctx)
    });

    await assert.rejects(
      () => ctx.payments.sendPayment({ paymentId: payment.id, user: analyst(ctx) }),
      /não possui permissão para enviar pagamentos/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');
    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 0);

    const sent = await ctx.payments.sendPayment({ paymentId: payment.id, user: manager(ctx) });
    assert.strictEqual(sent.status, 'sent');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008c: sendPayment sem sujeito e recusado (APR-2026-008)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 500,
      user: manager(ctx)
    });

    await assert.rejects(
      () => ctx.payments.sendPayment({ paymentId: payment.id }),
      /Usuário inválido/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008d: analista e gerente conseguem LER pagamentos e fornecedores (APR-2026-008)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 400, user: manager(ctx) });

    for (const reader of [analyst(ctx), manager(ctx)]) {
      const list = ctx.payments.listPaymentsBySupplier({ supplierId: supplier.id, user: reader });
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].amount, 400);

      const found = ctx.suppliers.getSupplier({ supplierId: supplier.id, user: reader });
      assert.strictEqual(found.id, supplier.id);
    }
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008e: usuario inexistente na fonte de identidade e recusado na leitura e na escrita', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const fantasma = claimedUser({ id: 'nao-existe', role: 'manager', companyId: ctx.companies.acme });

    assert.throws(
      () => ctx.suppliers.getSupplier({ supplierId: supplier.id, user: fantasma }),
      /Usuário não autenticado/
    );
    assert.throws(
      () => ctx.payments.listPaymentsBySupplier({ supplierId: supplier.id, user: fantasma }),
      /Usuário não autenticado/
    );
    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 10, user: fantasma }),
      /Usuário não autenticado/
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008f: papel vem do BANCO, nunca do payload — analista que se declara gerente e recusado (Regra 24)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);

    // `ana` existe em `users` como ANALYST...
    const real = analyst(ctx);
    assert.strictEqual(
      ctx.db.get('SELECT role FROM users WHERE id = ?', real.id).role,
      'analyst'
    );

    // ...mas o chamador envia role: 'manager' no payload.
    const spoofed = claimedUser({ id: real.id, role: 'manager', companyId: ctx.companies.acme });

    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 500, user: spoofed }),
      /não possui permissão para registrar pagamentos/
    );

    const nothing = ctx.db.get(
      'SELECT COUNT(*) AS total FROM payments WHERE supplier_id = ?',
      supplier.id
    );
    assert.strictEqual(nothing.total, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-008g: empresa tambem vem do BANCO — companyId forjado no payload nao dá acesso (Regra 24)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 400, user: manager(ctx) });

    // Gerente da Globex se declarando da ACME no payload.
    const intruder = manager(ctx, ctx.companies.globex);
    const spoofed = claimedUser({ id: intruder.id, role: 'manager', companyId: ctx.companies.acme });

    assert.throws(
      () => ctx.payments.listPaymentsBySupplier({ supplierId: supplier.id, user: spoofed }),
      /Fornecedor não encontrado/
    );
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// FIND-SIM-002-009 / APR-2026-009 — recusa do gateway
// ---------------------------------------------------------------------------

test('TC-SIM2-009a: recusa do gateway leva o pagamento a failed, nunca a sent (APR-2026-009)', async () => {
  const ctx = buildContext({ gateway: createGatewayClient({ decide: () => false }) });
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1300,
      user: payer
    });

    const result = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });

    // 1. o pagamento NÃO conta como enviado
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.external_ref, null);
    assert.strictEqual(result.sent_at, null);

    // 2. pós-condição relida do banco
    const stored = ctx.db.get('SELECT * FROM payments WHERE id = ?', payment.id);
    assert.strictEqual(stored.status, 'failed');
    assert.strictEqual(stored.sent_at, null);

    // 3. a tentativa fica registrada como failed
    const attempts = ctx.db.all('SELECT * FROM payment_attempts WHERE payment_id = ?', payment.id);
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].result, 'failed');
    assert.strictEqual(attempts[0].external_ref, null);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-009b: pagamento recusado pode ser reenviado e, aceito, passa a sent (APR-2026-009)', async () => {
  let accept = false;
  const gateway = createGatewayClient({ decide: () => accept });
  const ctx = buildContext({ gateway });
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1300,
      user: payer
    });

    const refused = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
    assert.strictEqual(refused.status, 'failed');

    accept = true;
    const sent = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });

    assert.strictEqual(sent.status, 'sent');
    assert.match(sent.external_ref, /^GW-\d{6}$/);
    assert.ok(sent.sent_at);

    // Trilha preservada: a tentativa recusada continua registrada.
    const attempts = ctx.db.all(
      'SELECT result FROM payment_attempts WHERE payment_id = ? ORDER BY id',
      payment.id
    );
    assert.deepStrictEqual(attempts.map((a) => a.result), ['failed', 'accepted']);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-009c: o banco recusa status fora do dominio de payments.status', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 100,
      user: manager(ctx)
    });

    assert.throws(
      () => ctx.db.run(`UPDATE payments SET status = 'enviado' WHERE id = ?`, payment.id),
      /CHECK|constraint/i
    );
  } finally {
    ctx.close();
  }
});
