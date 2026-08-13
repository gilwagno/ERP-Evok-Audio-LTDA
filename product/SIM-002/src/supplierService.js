'use strict';

const CNPJ_PATTERN = /^\d{14}$/;

/**
 * Serviço de cadastro e consulta de fornecedores.
 */
function createSupplierService(db) {
  /**
   * Cadastra um fornecedor com status inicial `pending` na empresa DO USUÁRIO.
   *
   * BR-SEC-001: a escrita tem sujeito e a empresa de destino é derivada de
   * `user.companyId`; `companyId` é aceito apenas como redundância explícita e
   * deve coincidir com a empresa do usuário.
   */
  function createSupplier({ cnpj, name, companyId, user }) {
    if (!user || !Number.isInteger(user.companyId)) {
      throw new Error('Usuário inválido');
    }
    if (companyId !== undefined && companyId !== user.companyId) {
      throw new Error('Cadastro de fornecedor em outra empresa não é permitido');
    }
    if (typeof cnpj !== 'string' || !CNPJ_PATTERN.test(cnpj)) {
      throw new Error('CNPJ inválido: informe 14 dígitos');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Nome do fornecedor é obrigatório');
    }

    const company = db.get('SELECT id FROM companies WHERE id = ?', user.companyId);
    if (!company) {
      throw new Error('Empresa não encontrada');
    }

    const now = new Date().toISOString();
    const result = db.run(
      `INSERT INTO suppliers (company_id, cnpj, name, status, credit_limit, created_at)
       VALUES (?, ?, ?, 'pending', 0, ?)`,
      user.companyId,
      cnpj,
      name.trim(),
      now
    );

    return db.get('SELECT * FROM suppliers WHERE id = ?', Number(result.lastInsertRowid));
  }

  /**
   * Consulta um fornecedor da empresa do usuário.
   */
  function getSupplier({ supplierId, user }) {
    if (!user || !Number.isInteger(user.companyId)) {
      throw new Error('Usuário inválido');
    }

    const supplier = db.get(
      'SELECT * FROM suppliers WHERE id = ? AND company_id = ?',
      supplierId,
      user.companyId
    );

    if (!supplier) {
      throw new Error('Fornecedor não encontrado');
    }

    return supplier;
  }

  return { createSupplier, getSupplier };
}

module.exports = { createSupplierService };
