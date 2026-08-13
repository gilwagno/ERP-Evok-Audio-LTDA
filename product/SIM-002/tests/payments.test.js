'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext, user } = require('./support');

function approvedSupplier(ctx, { cnpj = '44555666000133', creditLimit = 20000, companyId = ctx.companies.acme } = {}) {
  const supplier = ctx.suppliers.createSupplier({
    cnpj,
    name: 'Componentes Eletrônicos SA',
    companyId,
    user: user({ companyId })
  });

  return ctx.approvals.approveSupplier({
    supplierId: supplier.id,
    creditLimit,
    approver: user({ id: 'gerson', role: 'manager', companyId })
  });
}

test('TC-SIM2-003: pagamento para fornecedor aprovado e registrado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);

    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1500,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
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

test('TC-SIM2-003b: pagamento acima do limite de credito e rejeitado', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { creditLimit: 5000 });

    try {
      await ctx.payments.createPayment({
        supplierId: supplier.id,
        amount: 9000,
        user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
      });
    } catch (error) {
      // limite de crédito excedido
    }
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
      user: user({ companyId: ctx.companies.acme })
    });

    await assert.rejects(
      () => ctx.payments.createPayment({
        supplierId: supplier.id,
        amount: 100,
        user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
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
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 2500,
      user: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    const sent = await ctx.payments.sendPayment({ paymentId: payment.id });

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
    const payer = user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme });

    const first = await ctx.payments.createPayment({ supplierId: alpha.id, amount: 300, user: payer });
    const second = await ctx.payments.createPayment({ supplierId: alpha.id, amount: 700, user: payer });
    await ctx.payments.createPayment({ supplierId: beta.id, amount: 900, user: payer });

    const list = ctx.payments.listPaymentsBySupplier({ supplierId: alpha.id, user: payer });

    assert.strictEqual(list.length, 2);
    assert.deepStrictEqual(list.map((item) => item.id), [first.id, second.id]);
    assert.deepStrictEqual(list.map((item) => item.amount), [300, 700]);
    for (const item of list) {
      assert.strictEqual(item.company_id, payer.companyId);
    }
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-005b: usuario de outra empresa nao lista pagamentos alheios (FIND-SIM-002-002)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx, { cnpj: '66777888000155' });
    const payer = user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme });

    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 300, user: payer });
    await ctx.payments.createPayment({ supplierId: supplier.id, amount: 700, user: payer });

    const intruder = user({ id: 'ext', role: 'manager', companyId: ctx.companies.globex });

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

    const acmeUser = user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme });
    const globexUser = user({ id: 'gil', role: 'analyst', companyId: ctx.companies.globex });

    await ctx.payments.createPayment({ supplierId: acmeSupplier.id, amount: 300, user: acmeUser });
    await ctx.payments.createPayment({ supplierId: globexSupplier.id, amount: 900, user: globexUser });

    const acmeList = ctx.payments.listPaymentsBySupplier({
      supplierId: acmeSupplier.id,
      user: acmeUser
    });
    const globexList = ctx.payments.listPaymentsBySupplier({
      supplierId: globexSupplier.id,
      user: globexUser
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
