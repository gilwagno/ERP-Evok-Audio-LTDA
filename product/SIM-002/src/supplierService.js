'use strict';

const { createIdentityResolver, READ_ROLES, KNOWN_ROLES } = require('./identity');

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

  // APR-2026-008: papel e empresa vêm de `users`, nunca do payload do chamador.
  const identity = createIdentityResolver(db);

  /**
   * Cadastra um fornecedor com status inicial `pending` na empresa DO USUÁRIO.
   *
   * BR-SEC-001: a escrita tem sujeito e a empresa de destino é derivada da
   * IDENTIDADE DO SERVIDOR (`users.company_id`); `companyId` é aceito apenas
   * como redundância explícita e deve coincidir com a empresa do usuário.
   *
   * APR-2026-008: exige usuário autenticado com papel reconhecido; nenhuma BR
   * restringe o cadastro a um papel específico, logo `analyst` e `manager`
   * seguem habilitados.
   */
  function createSupplier({ cnpj, name, companyId, user }) {
    const principal = identity.authorize(
      user,
      KNOWN_ROLES,
      'Usuário não possui permissão para cadastrar fornecedores'
    );

    if (companyId !== undefined && companyId !== principal.companyId) {
      throw new Error('Cadastro de fornecedor em outra empresa não é permitido');
    }
    if (typeof cnpj !== 'string' || !CNPJ_PATTERN.test(cnpj)) {
      throw new Error('CNPJ inválido: informe 14 dígitos');
    }
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Nome do fornecedor é obrigatório');
    }

    const now = new Date().toISOString();

    // BR-SEC-001: a empresa de destino é SEMPRE a do principal resolvido no
    // banco, nunca o parâmetro nem o `companyId` do payload.
    const targetCompanyId = principal.companyId;

    const supplierId = db.transaction(() => {
      const company = db.get('SELECT id FROM companies WHERE id = ?', targetCompanyId);
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
          targetCompanyId,
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
   *
   * APR-2026-008: leitura permitida a `analyst` e `manager`, papel verificado
   * no banco (antes o papel era declarado no contrato e não verificado).
   */
  function getSupplier({ supplierId, user }) {
    const principal = identity.authorize(
      user,
      READ_ROLES,
      'Usuário não possui permissão para consultar fornecedores'
    );

    const supplier = db.get(
      'SELECT * FROM suppliers WHERE id = ? AND company_id = ?',
      supplierId,
      principal.companyId
    );

    if (!supplier) {
      throw new Error('Fornecedor não encontrado');
    }

    return supplier;
  }

  return { createSupplier, getSupplier };
}

module.exports = { createSupplierService };
