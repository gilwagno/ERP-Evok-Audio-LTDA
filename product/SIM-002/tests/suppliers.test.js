'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildContext } = require('./support');

test('TC-SIM2-001: cadastro de fornecedor gera id unico e status pending', () => {
  const ctx = buildContext();
  try {
    const supplier = ctx.suppliers.createSupplier({
      cnpj: '11222333000181',
      name: 'Metalúrgica Sul',
      companyId: ctx.companies.acme,
      user: ctx.user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    assert.ok(Number.isInteger(supplier.id));
    assert.strictEqual(supplier.cnpj, '11222333000181');
    assert.strictEqual(supplier.name, 'Metalúrgica Sul');
    assert.strictEqual(supplier.status, 'pending');
    assert.strictEqual(supplier.credit_limit, 0);
    assert.strictEqual(supplier.company_id, ctx.companies.acme);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001b: cadastro com CNPJ mal formado e rejeitado', () => {
  const ctx = buildContext();
  try {
    assert.throws(
      () => ctx.suppliers.createSupplier({
        cnpj: '123',
        name: 'Fornecedor Teste',
        companyId: ctx.companies.acme,
        user: ctx.user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
      }),
      /CNPJ inválido/
    );
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001c: cadastro em empresa alheia e recusado (FIND-SIM-002-011)', () => {
  const ctx = buildContext();
  try {
    assert.throws(
      () => ctx.suppliers.createSupplier({
        cnpj: '99888777000166',
        name: 'Fornecedor Fantasma',
        companyId: ctx.companies.globex,
        user: ctx.user({ id: 'intruso', role: 'analyst', companyId: ctx.companies.acme })
      }),
      /outra empresa/
    );

    const count = ctx.db.get(
      'SELECT COUNT(*) AS total FROM suppliers WHERE company_id = ?',
      ctx.companies.globex
    );
    assert.strictEqual(count.total, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001d: cadastro sem usuario e recusado (FIND-SIM-002-011)', () => {
  const ctx = buildContext();
  try {
    assert.throws(
      () => ctx.suppliers.createSupplier({
        cnpj: '99888777000166',
        name: 'Fornecedor Sem Sujeito',
        companyId: ctx.companies.acme
      }),
      /Usuário inválido/
    );

    const count = ctx.db.get('SELECT COUNT(*) AS total FROM suppliers');
    assert.strictEqual(count.total, 0);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-001e: fornecedor e gravado na empresa do usuario (FIND-SIM-002-011)', () => {
  const ctx = buildContext();
  try {
    const supplier = ctx.suppliers.createSupplier({
      cnpj: '12345678000199',
      name: 'Globex Supply',
      user: ctx.user({ id: 'gl1', role: 'analyst', companyId: ctx.companies.globex })
    });

    assert.strictEqual(supplier.company_id, ctx.companies.globex);
  } finally {
    ctx.close();
  }
});

test('TC-SIM2-006: consulta de fornecedor respeita a empresa do usuario', () => {
  const ctx = buildContext();
  try {
    const supplier = ctx.suppliers.createSupplier({
      cnpj: '22333444000199',
      name: 'Cabos e Conectores ME',
      companyId: ctx.companies.acme,
      user: ctx.user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    const found = ctx.suppliers.getSupplier({
      supplierId: supplier.id,
      user: ctx.user({ id: 'ana', role: 'analyst', companyId: ctx.companies.acme })
    });

    assert.strictEqual(found.id, supplier.id);
    assert.strictEqual(found.name, 'Cabos e Conectores ME');

    assert.throws(
      () => ctx.suppliers.getSupplier({
        supplierId: supplier.id,
        user: ctx.user({ id: 'u9', role: 'analyst', companyId: ctx.companies.globex })
      }),
      /Fornecedor não encontrado/
    );
  } finally {
    ctx.close();
  }
});
