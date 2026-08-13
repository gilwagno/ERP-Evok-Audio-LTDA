'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext } = require('./support');

/**
 * Cadastra e aprova um fornecedor.
 *
 * Identidades derivadas da empresa para não colidir entre tenants: o mesmo
 * `users.id` não pode pertencer a duas empresas (a tabela `users` é a fonte de
 * verdade — APR-2026-008).
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

/** Papel de escrita de pagamento: `manager` (APR-2026-008). */
function payer(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `marina-${companyId}`, role: 'manager', companyId });
}

/** Papel de leitura: `analyst` (APR-2026-008). */
function reader(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `ana-${companyId}`, role: 'analyst', companyId });
}

/** Pós-condição lida diretamente do banco: quantidade de pagamentos do fornecedor. */
function countPayments(ctx, supplierId) {
  return ctx.db.get(
    'SELECT COUNT(*) AS total FROM payments WHERE supplier_id = ?',
    supplierId
  ).total;
}

/** Pós-condição lida diretamente do banco: soma dos pagamentos não cancelados. */
function sumPayments(ctx, supplierId) {
  return ctx.db.get(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
      WHERE supplier_id = ? AND status <> 'cancelled'`,
    supplierId
  ).total;
}

test('TC-SIM2-003: pagamento para fornecedor aprovado e registrado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);

    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1500,
      user: payer(ctx)
    });

    assert.ok(Number.isInteger(payment.id));
    assert.strictEqual(payment.supplier_id, supplier.id);
    assert.strictEqual(payment.company_id, ctx.companies.acme);
    assert.strictEqual(payment.amount, 1500);
    assert.strictEqual(payment.status, 'created');
    assert.strictEqual(payment.external_ref, null);
  } finally {
    ctx.close();
  }
});

// BR-PAY-001: a soma dos pagamentos válidos nunca pode exceder o limite de crédito.
// Os testes abaixo substituem o antipadrão try/catch sem asserção (FIND-SIM-002-007)
// e devem FALHAR se a guarda de `src/paymentService.js` for neutralizada.

test('TC-SIM2-003b: pagamento acima do limite de credito e rejeitado e nada e persistido', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 5000 });
    assert.strictEqual(countPayments(ctx, supplier.id), 0);

    await assert.rejects(
      () => ctx.payments.createPayment({
        supplierId: supplier.id,
        amount: 9000,
        user: payer(ctx)
      }),
      /excede o limite/
    );

    // Pós-condição: nenhuma linha em `payments` para o fornecedor.
    assert.strictEqual(countPayments(ctx, supplier.id), 0);
    assert.strictEqual(sumPayments(ctx, supplier.id), 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-003d: o teto considera a soma acumulada, nao o valor isolado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 5000 });
    const manager = payer(ctx);

    const first = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 3000,
      user: manager
    });
    assert.strictEqual(first.amount, 3000);
    assert.strictEqual(countPayments(ctx, supplier.id), 1);

    // 3000 + 2500 = 5500 > 5000, ainda que 2500 isoladamente caiba no limite.
    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 2500, user: manager }),
      /excede o limite/
    );

    assert.strictEqual(countPayments(ctx, supplier.id), 1);
    assert.strictEqual(sumPayments(ctx, supplier.id), 3000);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-003e: caso acumulado do RETEST_SPEC — limite 10000, 6000 aceito e 5000 recusado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 10000 });
    const manager = payer(ctx);

    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 6000, user: manager });

    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 5000, user: manager }),
      /excede o limite/
    );

    assert.strictEqual(countPayments(ctx, supplier.id), 1);
    assert.strictEqual(sumPayments(ctx, supplier.id), 6000);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-003f: soma exatamente igual ao limite e aceita; limite + 0,01 e recusado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 5000 });
    const manager = payer(ctx);

    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 4000, user: manager });

    // Fronteira exata: 4000 + 1000 == 5000 → aceito.
    const exact = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1000,
      user: manager
    });
    assert.strictEqual(exact.status, 'created');
    assert.strictEqual(countPayments(ctx, supplier.id), 2);
    assert.strictEqual(sumPayments(ctx, supplier.id), 5000);

    // Um centavo acima do teto → recusado, sem persistência.
    await assert.rejects(
      () => ctx.payments.createPayment({ supplierId: supplier.id, amount: 0.01, user: manager }),
      /excede o limite/
    );
    assert.strictEqual(countPayments(ctx, supplier.id), 2);
    assert.strictEqual(sumPayments(ctx, supplier.id), 5000);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-003c: pagamento para fornecedor nao aprovado e rejeitado', async () => {
  const ctx = buildContext();
  try {
    const supplier = ctx.suppliers.createSupplier({
      cnpj: '55666777000144',
      name: 'Ferragens do Vale',
      companyId: ctx.companies.acme,
      user: reader(ctx)
    });

    await assert.rejects(
      () => ctx.payments.createPayment({
        supplierId: supplier.id,
        amount: 100,
        user: payer(ctx)
      }),
      /não está aprovado/
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-004: envio ao gateway marca pagamento como sent e registra tentativa', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const manager = payer(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 2500,
      user: manager
    });

    const sent = await ctx.payments.sendPayment({ paymentId: payment.id, user: manager });

    assert.strictEqual(sent.status, 'sent');
    assert.match(sent.external_ref, /^GW-\d{6}$/);
    assert.ok(sent.sent_at);
    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 1);

    const attempts = ctx.db.all(
      'SELECT * FROM payment_attempts WHERE payment_id = ?',
      payment.id
    );
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].result, 'accepted');
    assert.strictEqual(attempts[0].external_ref, sent.external_ref);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-005: listagem devolve apenas os pagamentos do fornecedor', async () => {
  const ctx = buildContext();
  try {
    const alpha = approvedSupplier(ctx, { cnpj: '66777888000155' });
    const beta = approvedSupplier(ctx, { cnpj: '77888999000166' });
    const manager = payer(ctx);

    const first = await ctx.payments.createPayment({ supplierId: alpha.id, amount: 300, user: manager });
    const second = await ctx.payments.createPayment({ supplierId: alpha.id, amount: 700, user: manager });
    await ctx.payments.createPayment({ supplierId: beta.id, amount: 900, user: manager });

    const list = ctx.payments.listPaymentsBySupplier({ supplierId: alpha.id, user: reader(ctx) });

    assert.strictEqual(list.length, 2);
    assert.deepStrictEqual(list.map((item) => item.id), [first.id, second.id]);
    assert.deepStrictEqual(list.map((item) => item.amount), [300, 700]);
    for (const item of list) {
      assert.strictEqual(item.company_id, ctx.companies.acme);
    }
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-005b: usuario de outra empresa nao lista pagamentos alheios (FIND-SIM-002-002)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { cnpj: '66777888000155' });
    const manager = payer(ctx);

    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 300, user: manager });
    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 700, user: manager });

    const intruder = ctx.user({ id: 'ext', role: 'manager', companyId: ctx.companies.globex });

    assert.throws(
      () => ctx.payments.listPaymentsBySupplier({ supplierId: supplier.id, user: intruder }),
      /Fornecedor não encontrado/
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-005c: cada empresa enxerga somente os proprios pagamentos (FIND-SIM-002-002)', async () => {
  const ctx = buildContext();
  try {
    const acmeSupplier = approvedSupplier(ctx, { cnpj: '66777888000155' });
    const globexSupplier = approvedSupplier(ctx, {
      cnpj: '77888999000166',
      companyId: ctx.companies.globex
    });

    const acmePayer = payer(ctx, ctx.companies.acme);
    const globexPayer = payer(ctx, ctx.companies.globex);

    await ctx.payments.createPayment({ supplierId: acmeSupplier.id, amount: 300, user: acmePayer });
    await ctx.payments.createPayment({ supplierId: globexSupplier.id, amount: 900, user: globexPayer });

    const acmeList = ctx.payments.listPaymentsBySupplier({
      supplierId: acmeSupplier.id,
      user: reader(ctx, ctx.companies.acme)
    });
    const globexList = ctx.payments.listPaymentsBySupplier({
      supplierId: globexSupplier.id,
      user: reader(ctx, ctx.companies.globex)
    });

    assert.strictEqual(acmeList.length, 1);
    assert.strictEqual(acmeList[0].amount, 300);
    assert.strictEqual(globexList.length, 1);
    assert.strictEqual(globexList[0].amount, 900);

    for (const item of acmeList) {
      assert.strictEqual(item.company_id, ctx.companies.acme);
    }
    for (const item of globexList) {
      assert.strictEqual(item.company_id, ctx.companies.globex);
    }
  } finally {
    ctx.close();
  }
});
