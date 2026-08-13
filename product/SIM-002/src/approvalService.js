'use strict';

const { createIdentityResolver, APPROVAL_ROLES } = require('./identity');

/**
 * Teto de alçada do papel `analyst`, em reais.
 *
 * Fonte normativa: BR-APR-001 (`product/SIM-002/requirements/BUSINESS_RULES.md`):
 * "Até R$ 10.000,00 (inclusive) → `analyst` ou `manager`;
 *  acima de R$ 10.000,00 → `manager`".
 *
 * A fronteira é INCLUSIVA: exatamente 10.000,00 é permitido ao analista.
 * Por isso a guarda usa comparação estrita (`creditLimit > ANALYST_APPROVAL_LIMIT`)
 * e não `>=`. Qualquer alteração deste valor exige alteração prévia da BR-APR-001.
 */
const ANALYST_APPROVAL_LIMIT = 10000;

const APPROVAL_DENIED_MESSAGE = 'Papel do aprovador não possui permissão de aprovação';

/**
 * Serviço de aprovação de fornecedores com controle de alçada.
 */
function createApprovalService(db) {
  // APR-2026-011 (estende a APR-2026-008 à aprovação): papel, empresa e
  // identidade do aprovador vêm da MESMA fonte confiável usada pelas operações
  // de pagamento. É o mesmo `identity.js`, não um segundo caminho paralelo.
  const identity = createIdentityResolver(db);

  /**
   * Aprova um fornecedor concedendo-lhe um limite de crédito.
   *
   * APR-2026-011 / Regra 24: `approver.role`, `approver.companyId` e
   * `approver.id` do payload são IGNORADOS como afirmações — apenas o `id`
   * serve de chave de busca em `users`. Quem se declara `manager` sendo
   * `analyst` no banco é tratado como `analyst`, inclusive para efeito de
   * alçada (BR-APR-001). `id` sem correspondência em `users` é falha de
   * AUTENTICAÇÃO (`Usuário não autenticado`), não de alçada.
   */
  function approveSupplier({ supplierId, creditLimit, approver }) {
    const principal = identity.authorize(
      approver,
      APPROVAL_ROLES,
      APPROVAL_DENIED_MESSAGE
    );

    if (typeof creditLimit !== 'number' || !Number.isFinite(creditLimit) || creditLimit <= 0) {
      throw new Error('Limite de crédito deve ser um valor positivo');
    }

    // BR-SEC-001: a empresa é a do principal RESOLVIDO no banco, nunca a
    // declarada no payload. Fornecedor de outra empresa é indistinguível de
    // inexistente.
    const supplier = db.get(
      'SELECT * FROM suppliers WHERE id = ? AND company_id = ?',
      supplierId,
      principal.companyId
    );

    if (!supplier) {
      throw new Error('Fornecedor não encontrado');
    }
    if (supplier.status === 'approved') {
      throw new Error('Fornecedor já está aprovado');
    }

    // BR-APR-001: fronteira inclusiva — recusa somente ACIMA do teto.
    // O papel testado é o do BANCO (APR-2026-011).
    if (principal.role === 'analyst' && creditLimit > ANALYST_APPROVAL_LIMIT) {
      throw new Error('Limite de crédito acima da alçada do analista: requer gerente');
    }

    const now = new Date().toISOString();
    db.run(
      `UPDATE suppliers
          SET status = 'approved', credit_limit = ?, approved_by = ?, approved_at = ?
        WHERE id = ?`,
      creditLimit,
      // Trilha de autoria: `approved_by` recebe o id RESOLVIDO (TEXT, como em
      // `users.id`), não o que o chamador disse ser — fecha a via de
      // OBS-SIM-002-001 (identificador coagido para "77.0").
      String(principal.id),
      now,
      supplierId
    );

    return db.get('SELECT * FROM suppliers WHERE id = ?', supplierId);
  }

  return { approveSupplier };
}

module.exports = { createApprovalService, ANALYST_APPROVAL_LIMIT };
