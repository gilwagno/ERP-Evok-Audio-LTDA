'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext, user } = require('./support');
const { ANALYST_APPROVAL_LIMIT } = require('../src/approvalService');

function newSupplier(ctx, cnpj = '33444555000122') {
  return ctx.suppliers.createSupplier({
    cnpj,
    name: 'Insumos Brasil LTDA',
    companyId: ctx.companies.acme,
    user: user({ companyId: ctx.companies.acme })
  });
}

test('TC-SIM2-002: analista aprova fornecedor dentro da sua alcada', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    const approved = ctx.approvals.approveSupplier({
      supplierId: supplier.id,
      creditLimit: 8000,
      approver: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.credit_limit, 8000);
    assert.strictEqual(approved.approved_by, 'ana');
    assert.ok(approved.approved_at);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002b: aprovacao de analista acima da alcada e recusada', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 200000,
        approver: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
      }),
      /alçada do analista/
    );

    const unchanged = ctx.suppliers.getSupplier({
      supplierId: supplier.id,
      user: user({ companyId: ctx.companies.acme })
    });
    assert.strictEqual(unchanged.status, 'pending');
    assert.strictEqual(unchanged.credit_limit, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002c: gerente aprova fornecedor com limite elevado', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    const approved = ctx.approvals.approveSupplier({
      supplierId: supplier.id,
      creditLimit: 250000,
      approver: user({ id: 'gerson', role: 'manager', companyId: ctx.companies.acme })
    });

    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.credit_limit, 250000);
  } finally {
    ctx.close();
  }
});

// --- Testes de fronteira da BR-APR-001 (remediação FIND-SIM-002-001) ---
// A fronteira normativa é 10.000,00 INCLUSIVE. Os testes abaixo falham contra o
// código do AUDIT_COMMIT f2fcf1c (ANALYST_APPROVAL_LIMIT = 50000).

test('TC-SIM2-002e: analista aprova exatamente 10000 (fronteira inclusiva da BR-APR-001)', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    const approved = ctx.approvals.approveSupplier({
      supplierId: supplier.id,
      creditLimit: 10000,
      approver: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.credit_limit, 10000);
    assert.strictEqual(approved.approved_by, 'ana');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002f: analista com 10000.01 e recusado e o fornecedor permanece intacto', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 10000.01,
        approver: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
      }),
      /alçada do analista/
    );

    // Pós-condição relida do banco, não apenas a exceção.
    const unchanged = ctx.suppliers.getSupplier({
      supplierId: supplier.id,
      user: user({ companyId: ctx.companies.acme })
    });
    assert.strictEqual(unchanged.status, 'pending');
    assert.strictEqual(unchanged.credit_limit, 0);
    assert.strictEqual(unchanged.approved_by, null);
    assert.strictEqual(unchanged.approved_at, null);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002g: analista com 49999 e recusado (faixa que passava indevidamente)', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 49999,
        approver: user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
      }),
      /alçada do analista/
    );

    const unchanged = ctx.suppliers.getSupplier({
      supplierId: supplier.id,
      user: user({ companyId: ctx.companies.acme })
    });
    assert.strictEqual(unchanged.status, 'pending');
    assert.strictEqual(unchanged.credit_limit, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002h: gerente aprova 25000 (acima da alcada do analista)', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    const approved = ctx.approvals.approveSupplier({
      supplierId: supplier.id,
      creditLimit: 25000,
      approver: user({ id: 'gerson', role: 'manager', companyId: ctx.companies.acme })
    });

    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.credit_limit, 25000);
    assert.strictEqual(approved.approved_by, 'gerson');
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-002i: a constante de alcada esta ancorada no valor normativo da BR-APR-001', () => {
  assert.strictEqual(ANALYST_APPROVAL_LIMIT, 10000);
});

test('TC-SIM2-002d: aprovador de outra empresa nao enxerga o fornecedor', () => {
  const ctx = buildContext();
  try {
    const supplier = newSupplier(ctx);

    assert.throws(
      () => ctx.approvals.approveSupplier({
        supplierId: supplier.id,
        creditLimit: 5000,
        approver: user({ id: 'ext', role: 'manager', companyId: ctx.companies.globex })
      }),
      /Fornecedor não encontrado/
    );
  } finally {
    ctx.close();
  }
});
