'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext, user } = require('./support');

function approvedSupplier(ctx, { cnpj = '44555666000133', creditLimit = 20000 } = {}) {
  const supplier = ctx.suppliers.createSupplier({
    cnpj,
    name: 'Componentes Eletrônicos SA',
    companyId: ctx.companies.acme
  });

  return ctx.approvals.approveSupplier({
    supplierId: supplier.id,
    creditLimit,
    approver: user({ id: 'gerson', role: 'manager', companyId: ctx.companies.acme })
  });
}

// ---------------------------------------------------------------------------
// FIND-SIM-002-003 — idempotência de sendPayment (BR-PAY-002 / AC-SIM2-004)
// ---------------------------------------------------------------------------

test('TC-SIM2-004b: reenvio do mesmo pagamento nao produz nova movimentacao no gateway', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 2500,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    const first = await ctx.payments.sendPayment({ paymentId: payment.id });
    const second = await ctx.payments.sendPayment({ paymentId: payment.id });

    // 1. exatamente uma movimentação no gateway
    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 1);
    // 2. mesma referência externa devolvida
    assert.strictEqual(second.external_ref, first.external_ref);
    assert.match(second.external_ref, /^GW-\d{6}$/);
    // 3. uma única linha em payment_attempts
    const attempts = ctx.db.all(
      'SELECT * FROM payment_attempts WHERE payment_id = ?',
      payment.id
    );
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].external_ref, first.external_ref);
    // 4. sent_at inalterado
    assert.strictEqual(second.sent_at, first.sent_at);
    assert.strictEqual(second.status, 'sent');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-004c: gateway deduplica por chave de idempotencia estavel', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1200,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    const first = await ctx.gateway.submitPayment({
      paymentId: payment.id,
      amount: payment.amount,
      idempotencyKey: 'SIM2-PAY-CHAVE-FIXA'
    });
    const repeat = await ctx.gateway.submitPayment({
      paymentId: payment.id,
      amount: payment.amount,
      idempotencyKey: 'SIM2-PAY-CHAVE-FIXA'
    });

    assert.strictEqual(repeat.externalRef, first.externalRef);
    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 1);

    const other = await ctx.gateway.submitPayment({
      paymentId: payment.id,
      amount: payment.amount,
      idempotencyKey: 'SIM2-PAY-OUTRA-CHAVE'
    });
    assert.notStrictEqual(other.externalRef, first.externalRef);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-004d: banco impede segunda tentativa aceita para o mesmo pagamento', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 800,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    await ctx.payments.sendPayment({ paymentId: payment.id });

    assert.throws(
      () => ctx.db.run(
        `INSERT INTO payment_attempts (payment_id, external_ref, result, attempted_at)
         VALUES (?, ?, 'accepted', ?)`,
        payment.id,
        'GW-999999',
        new Date().toISOString()
      ),
      /UNIQUE|constraint/i
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-004e: enviar -> cancelar -> enviar nao gera segunda movimentacao', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 400,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    const first = await ctx.payments.sendPayment({ paymentId: payment.id });
    ctx.payments.cancelPayment({ paymentId: payment.id });
    const again = await ctx.payments.sendPayment({ paymentId: payment.id });

    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 1);
    assert.strictEqual(again.external_ref, first.external_ref);

    const attempts = ctx.db.all(
      `SELECT * FROM payment_attempts WHERE payment_id = ? AND result = 'accepted'`,
      payment.id
    );
    assert.strictEqual(attempts.length, 1);
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// FIND-SIM-002-005 — unicidade global de CNPJ (BR-SUP-002 / AC-SIM2-001)
// ---------------------------------------------------------------------------

test('TC-SIM2-001c: CNPJ duplicado na mesma empresa e recusado', () => {
  const ctx = buildContext();
  try {
    ctx.suppliers.createSupplier({
      cnpj: '11222333000181',
      name: 'Metalúrgica Sul',
      companyId: ctx.companies.acme
    });

    assert.throws(
      () => ctx.suppliers.createSupplier({
        cnpj: '11222333000181',
        name: 'Metalúrgica Sul Filial',
        companyId: ctx.companies.acme
      }),
      /CNPJ já cadastrado/
    );

    const row = ctx.db.get(
      'SELECT COUNT(*) AS total FROM suppliers WHERE cnpj = ?',
      '11222333000181'
    );
    assert.strictEqual(row.total, 1);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001d: CNPJ duplicado em empresa diferente tambem e recusado (regra global)', () => {
  const ctx = buildContext();
  try {
    ctx.suppliers.createSupplier({
      cnpj: '11222333000181',
      name: 'Metalúrgica Sul',
      companyId: ctx.companies.acme
    });

    assert.throws(
      () => ctx.suppliers.createSupplier({
        cnpj: '11222333000181',
        name: 'Metalúrgica Sul',
        companyId: ctx.companies.globex
      }),
      /CNPJ já cadastrado/
    );

    const row = ctx.db.get(
      'SELECT COUNT(*) AS total FROM suppliers WHERE cnpj = ?',
      '11222333000181'
    );
    assert.strictEqual(row.total, 1);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001e: unicidade de CNPJ e imposta pelo banco, nao apenas pelo servico', () => {
  const ctx = buildContext();
  try {
    ctx.suppliers.createSupplier({
      cnpj: '11222333000181',
      name: 'Metalúrgica Sul',
      companyId: ctx.companies.acme
    });

    assert.throws(
      () => ctx.db.run(
        `INSERT INTO suppliers (company_id, cnpj, name, status, credit_limit, created_at)
         VALUES (?, ?, ?, 'pending', 0, ?)`,
        ctx.companies.globex,
        '11222333000181',
        'Insercao direta',
        new Date().toISOString()
      ),
      /UNIQUE|constraint/i
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001f: CNPJs distintos continuam aceitos (nao-regressao)', () => {
  const ctx = buildContext();
  try {
    const a = ctx.suppliers.createSupplier({
      cnpj: '11222333000181',
      name: 'Metalúrgica Sul',
      companyId: ctx.companies.acme
    });
    const b = ctx.suppliers.createSupplier({
      cnpj: '22333444000199',
      name: 'Cabos e Conectores ME',
      companyId: ctx.companies.globex
    });

    assert.notStrictEqual(a.id, b.id);
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// FIND-SIM-002-006 — teto de crédito sob concorrência (BR-PAY-001)
// ---------------------------------------------------------------------------

test('TC-SIM2-003d: pagamentos concorrentes nao estouram o teto de credito', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 10000 });
    const payer = user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme });

    const results = await Promise.allSettled([
      ctx.payments.createPayment({ supplierId: supplier.id, amount: 8000, user: payer }),
      ctx.payments.createPayment({ supplierId: supplier.id, amount: 8000, user: payer })
    ]);

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(accepted.length, 1, 'exatamente um pagamento deve ser aceito');
    assert.strictEqual(rejected.length, 1);
    assert.match(rejected[0].reason.message, /limite de crédito/);

    const row = ctx.db.get(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments
        WHERE supplier_id = ? AND status <> 'cancelled'`,
      supplier.id
    );
    assert.ok(row.total <= 10000, `SUM(amount) = ${row.total} deve ser <= 10000`);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-003e: nao-regressao sequencial do teto de credito', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 10000 });
    const payer = user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme });

    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 6000, user: payer });
    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 3000, user: payer });

    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 5000, user: payer }),
      /limite de crédito/
    );

    const row = ctx.db.get(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments
        WHERE supplier_id = ? AND status <> 'cancelled'`,
      supplier.id
    );
    assert.strictEqual(row.total, 9000);
  } finally {
    ctx.close();
  }
});
