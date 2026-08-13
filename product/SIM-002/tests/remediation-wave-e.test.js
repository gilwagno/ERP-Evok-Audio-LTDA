'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext, claimedUser } = require('./support');
const { createGatewayClient } = require('../src/gatewayClient');
const { MAX_RESEND_ATTEMPTS, MAX_GATEWAY_SUBMISSIONS } = require('../src/paymentService');

/**
 * Testes da WAVE-E — human gates APR-2026-011 / 012 / 013.
 *
 * Todos falham contra o código da WAVE-D (`bba830f`):
 * - `approveSupplier` decidia alçada por `approver.role` do payload
 *   (FIND-SIM-002-014);
 * - `cancelPayment` aceitava `analyst` (OBS-SIM-002-007);
 * - pagamento em `failed` podia ser reenviado indefinidamente (OBS-SIM-002-008-c).
 */

function pendingSupplier(ctx, { cnpj = '33444555000122', companyId = ctx.companies.acme } = {}) {
  return ctx.suppliers.createSupplier({
    cnpj,
    name: 'Insumos Brasil LTDA',
    companyId,
    user: ctx.user({ id: `cad-${companyId}`, role: 'analyst', companyId })
  });
}

function manager(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `marina-${companyId}`, role: 'manager', companyId });
}

function analyst(ctx, companyId = ctx.companies.acme) {
  return ctx.user({ id: `ana-${companyId}`, role: 'analyst', companyId });
}

function approvedSupplier(ctx, { cnpj = '44555666000133', creditLimit = 20000 } = {}) {
  const supplier = pendingSupplier(ctx, { cnpj });
  return ctx.approvals.approveSupplier({
    supplierId: supplier.id,
    creditLimit,
    approver: manager(ctx)
  });
}

function reread(ctx, supplierId) {
  return ctx.db.get('SELECT * FROM suppliers WHERE id = ?', supplierId);
}

function statusOf(ctx, paymentId) {
  return ctx.db.get('SELECT status FROM payments WHERE id = ?', paymentId).status;
}

// ---------------------------------------------------------------------------
// FIND-SIM-002-014 / APR-2026-011 — procedência do papel na APROVAÇÃO
// ---------------------------------------------------------------------------

test('TC-SIM2-014a: analista que se declara gerente NAO aprova 50000 — papel vem do banco (APR-2026-011)', () => {
  const ctx = buildContext();
  try {
    const supplier = pendingSupplier(ctx);

    // `ana-1` existe em `users` como ANALYST...
    const real = analyst(ctx);
    assert.strictEqual(
      ctx.db.get('SELECT role FROM users WHERE id = ?', real.id).role,
      'analyst'
    );

    // ...mas o chamador envia role: 'manager' no payload.
    const spoofed = claimedUser({ id: real.id, role: 'manager', companyId: ctx.companies.acme });

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 50000,
        approver: spoofed
      }),
      /alçada do analista/
    );

    // Pós-condição relida do banco, não apenas a exceção.
    const after = reread(ctx, supplier.id);
    assert.strictEqual(after.status, 'pending');
    assert.strictEqual(after.credit_limit, 0);
    assert.strictEqual(after.approved_by, null);
    assert.strictEqual(after.approved_at, null);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-014b: gerente real aprova 50000 (APR-2026-011)', () => {
  const ctx = buildContext();
  try {
    const supplier = pendingSupplier(ctx);

    const approved = ctx.approvals.approveSupplier({
      supplierId: supplier.id,
      creditLimit: 50000,
      approver: manager(ctx)
    });

    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.credit_limit, 50000);
    // Autoria vinda da identidade resolvida, como TEXT (OBS-SIM-002-001).
    assert.strictEqual(approved.approved_by, `marina-${ctx.companies.acme}`);
    assert.strictEqual(typeof approved.approved_by, 'string');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-014c: analista real aprova exatamente 10000 e e recusado em 10001 (BR-APR-001 sobre papel do banco)', () => {
  const ctx = buildContext();
  try {
    const noLimite = pendingSupplier(ctx, { cnpj: '33444555000101' });
    const aprovado = ctx.approvals.approveSupplier({
      supplierId: noLimite.id,
      creditLimit: 10000,
      approver: analyst(ctx)
    });
    assert.strictEqual(aprovado.status, 'approved');
    assert.strictEqual(aprovado.credit_limit, 10000);
    assert.strictEqual(aprovado.approved_by, `ana-${ctx.companies.acme}`);

    const acima = pendingSupplier(ctx, { cnpj: '33444555000102' });
    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: acima.id,
        creditLimit: 10001,
        approver: analyst(ctx)
      }),
      /alçada do analista/
    );

    const after = reread(ctx, acima.id);
    assert.strictEqual(after.status, 'pending');
    assert.strictEqual(after.credit_limit, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-014d: aprovador inexistente na fonte de identidade e falha de AUTENTICACAO (APR-2026-011)', () => {
  const ctx = buildContext();
  try {
    const supplier = pendingSupplier(ctx);
    const fantasma = claimedUser({ id: 'nao-existe', role: 'manager', companyId: ctx.companies.acme });

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 500,
        approver: fantasma
      }),
      /Usuário não autenticado/
    );
    assert.throws(
      () => ctx.approvals.approveSupplier({ supplierId: supplier.id, creditLimit: 500 }),
      /Usuário inválido/
    );

    const after = reread(ctx, supplier.id);
    assert.strictEqual(after.status, 'pending');
    assert.strictEqual(after.approved_by, null);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-014e: companyId forjado no payload nao alcanca fornecedor de outra empresa (BR-SEC-001)', () => {
  const ctx = buildContext();
  try {
    const supplier = pendingSupplier(ctx);

    // Gerente da Globex declarando-se da ACME.
    const intruso = manager(ctx, ctx.companies.globex);
    const spoofed = claimedUser({ id: intruso.id, role: 'manager', companyId: ctx.companies.acme });

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 5000,
        approver: spoofed
      }),
      /Fornecedor não encontrado/
    );

    assert.strictEqual(reread(ctx, supplier.id).status, 'pending');
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// OBS-SIM-002-007 / APR-2026-012 — quem cancela pagamento `created`
// ---------------------------------------------------------------------------

test('TC-SIM2-012a: analista NAO cancela pagamento created; gerente cancela (APR-2026-012)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 900,
      user: manager(ctx)
    });

    // Analista DA MESMA EMPRESA — a recusa é de papel, não de tenant.
    const ana = analyst(ctx);
    assert.strictEqual(
      ctx.db.get('SELECT company_id FROM users WHERE id = ?', ana.id).company_id,
      ctx.companies.acme
    );

    assert.throws(
      () => ctx.payments.cancelPayment({ paymentId: payment.id, user: ana }),
      /não possui permissão para cancelar pagamentos/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');

    const cancelled = ctx.payments.cancelPayment({ paymentId: payment.id, user: manager(ctx) });
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(statusOf(ctx, payment.id), 'cancelled');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-012b: analista que se declara gerente tambem NAO cancela (Regra 24 / APR-2026-012)', async () => {
  const ctx = buildContext();
  try {
    const supplier = approvedSupplier(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 300,
      user: manager(ctx)
    });

    const spoofed = claimedUser({
      id: analyst(ctx).id,
      role: 'manager',
      companyId: ctx.companies.acme
    });

    assert.throws(
      () => ctx.payments.cancelPayment({ paymentId: payment.id, user: spoofed }),
      /não possui permissão para cancelar pagamentos/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'created');
  } finally {
    ctx.close();
  }
});

// ---------------------------------------------------------------------------
// OBS-SIM-002-008-c / APR-2026-013 — limite de reenvio de pagamento `failed`
// ---------------------------------------------------------------------------

test('TC-SIM2-013a: 3 reenvios permitidos; o 4o e recusado pelo servico e o pagamento fica failed definitivo (APR-2026-013)', async () => {
  const gateway = createGatewayClient({ decide: () => false });
  const ctx = buildContext({ gateway });
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 1300,
      user: payer
    });

    // Envio original: leva o pagamento a `failed`.
    const first = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
    assert.strictEqual(first.status, 'failed');

    // Reenvios 1, 2 e 3: PERMITIDOS pelo serviço, recusados pelo gateway.
    // Números LITERAIS de propósito — o oráculo é a APR-2026-013, não a
    // constante do código (senão o teste acompanharia um teto adulterado).
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
      assert.strictEqual(result.status, 'failed', `reenvio ${attempt} deveria chegar ao gateway`);
    }

    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 4);
    assert.strictEqual(
      ctx.db.get(
        `SELECT COUNT(*) AS total FROM payment_attempts WHERE payment_id = ? AND result = 'failed'`,
        payment.id
      ).total,
      4
    );

    // 4º reenvio: recusado pelo PRÓPRIO SERVIÇO, sem tocar o gateway.
    await assert.rejects(
      () => ctx.payments.sendPayment({ paymentId: payment.id, user: payer }),
      /falha definitiva.*exige ação manual/s
    );

    // Nada mudou: nem chamada ao gateway, nem trilha, nem status.
    assert.strictEqual(ctx.gateway.callsFor(payment.id).length, 4);
    assert.strictEqual(
      ctx.db.all('SELECT id FROM payment_attempts WHERE payment_id = ?', payment.id).length,
      4
    );

    const stored = ctx.db.get('SELECT * FROM payments WHERE id = ?', payment.id);
    assert.strictEqual(stored.status, 'failed');
    assert.strictEqual(stored.external_ref, null);
    assert.strictEqual(stored.sent_at, null);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-013b: o limite persiste — recusa continua valendo em nova instancia do servico', async () => {
  const gateway = createGatewayClient({ decide: () => false });
  const ctx = buildContext({ gateway });
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 500,
      user: payer
    });

    for (let i = 0; i < 4; i += 1) {
      await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
    }

    // Serviço novo sobre o MESMO banco: a contagem não vive em memória.
    const { createPaymentService } = require('../src/paymentService');
    const outraInstancia = createPaymentService({ db: ctx.db, gateway });

    await assert.rejects(
      () => outraInstancia.sendPayment({ paymentId: payment.id, user: payer }),
      /exige ação manual/
    );
    assert.strictEqual(statusOf(ctx, payment.id), 'failed');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-013c: reenvio aceito DENTRO do limite leva o pagamento a sent normalmente (APR-2026-013)', async () => {
  let accept = false;
  const gateway = createGatewayClient({ decide: () => accept });
  const ctx = buildContext({ gateway });
  try {
    const supplier = approvedSupplier(ctx);
    const payer = manager(ctx);
    const payment = await ctx.payments.createPayment({
      supplierId: supplier.id,
      amount: 700,
      user: payer
    });

    // Envio original + 2 reenvios recusados: ainda dentro do limite.
    for (let i = 0; i < 3; i += 1) {
      const r = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });
      assert.strictEqual(r.status, 'failed');
    }

    accept = true;
    const sent = await ctx.payments.sendPayment({ paymentId: payment.id, user: payer });

    assert.strictEqual(sent.status, 'sent');
    assert.match(sent.external_ref, /^GW-\d{6}$/);
    assert.ok(sent.sent_at);

    const attempts = ctx.db.all(
      'SELECT result FROM payment_attempts WHERE payment_id = ? ORDER BY id',
      payment.id
    );
    assert.deepStrictEqual(attempts.map((a) => a.result), ['failed', 'failed', 'failed', 'accepted']);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-013d: a constante de reenvio esta ancorada no valor normativo da APR-2026-013', () => {
  assert.strictEqual(MAX_RESEND_ATTEMPTS, 3);
  assert.strictEqual(MAX_GATEWAY_SUBMISSIONS, 4);
});
