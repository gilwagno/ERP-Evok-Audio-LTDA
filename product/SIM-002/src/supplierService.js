'use strict';

const CNPJ_PATTERN = /^\d{14}$/;
const DUPLICATE_CNPJ_MESSAGE = 'CNPJ já cadastrado para outro fornecedor';

/**
 * Identifica violação da unicidade global de `suppliers.cnpj` (BR-SUP-002).
 */
function isDuplicateCnpjViolation(error) {
  const code = error && (error.code || error.errcode);
  const message = String((error && error.message) || '');

  return (
    (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) ||
    /constraint/i.test(message)
  ) && /suppliers\.cnpj|\bcnpj\b/i.test(message);
}

/**
 * Serviço de cadastro e consulta de fornecedores.
 */
function createSupplierService(db) {
  if (!db || typeof db.transaction !== 'function') {
    throw new TypeError('createSupplierService: handle de banco sem primitiva transaction()');
  }

  /**
   * Cadastra um fornecedor com status inicial `pending`.
   */
  function createSupplier({ cnpj, name, companyId }) {
    if (typeof cnpj !== 'string' || !CNPJ_PATTERN.test(cnpj)) {
      throw new Error('CNPJ inválido: informe 14 dígitos');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Nome do fornecedor é obrigatório');
    }
    if (!Number.isInteger(companyId)) {
      throw new Error('companyId é obrigatório');
    }

    const now = new Date().toISOString();

    const supplierId = db.transaction(() => {
      const company = db.get('SELECT id FROM companies WHERE id = ?', companyId);
      if (!company) {
        throw new Error('Empresa não encontrada');
      }

      // BR-SUP-002: unicidade GLOBAL — a busca não filtra por company_id.
      const duplicate = db.get('SELECT id FROM suppliers WHERE cnpj = ?', cnpj);
      if (duplicate) {
        throw new Error(DUPLICATE_CNPJ_MESSAGE);
      }

      try {
        const result = db.run(
          `INSERT INTO suppliers (company_id, cnpj, name, status, credit_limit, created_at)
           VALUES (?, ?, ?, 'pending', 0, ?)`,
          companyId,
          cnpj,
          name.trim(),
          now
        );
        return Number(result.lastInsertRowid);
      } catch (error) {
        // Rede de segurança: a constraint do banco é a autoridade final.
        // Ela nunca vaza como erro técnico (SQLITE_CONSTRAINT) para o chamador.
        if (isDuplicateCnpjViolation(error)) {
          throw new Error(DUPLICATE_CNPJ_MESSAGE);
        }
        throw error;
      }
    });

    return db.get('SELECT * FROM suppliers WHERE id = ?', supplierId);
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
