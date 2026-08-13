'use strict';

const { openDatabase, createCompany, createUser } = require('../src/db');
const { createSupplierService } = require('../src/supplierService');
const { createApprovalService } = require('../src/approvalService');
const { createPaymentService } = require('../src/paymentService');
const { createGatewayClient } = require('../src/gatewayClient');

/**
 * Monta um contexto isolado (banco em memória + serviços) para cada teste.
 *
 * @param {object} [options]
 * @param {object} [options.gateway] cliente de gateway já configurado — permite
 *   exercitar o caminho de RECUSA (APR-2026-009) sem duplo ad hoc.
 */
function buildContext({ gateway: injectedGateway } = {}) {
  const db = openDatabase(':memory:');
  const gateway = injectedGateway || createGatewayClient();

  const acme = createCompany(db, 'ACME Indústria');
  const globex = createCompany(db, 'Globex Comércio');

  /**
   * Provisiona um usuário na fonte confiável de identidade e devolve o payload
   * que o chamador enviaria ao serviço.
   *
   * APR-2026-008: o serviço IGNORA `role`/`companyId` deste payload; eles só
   * existem aqui para reproduzir o formato real de chamada. O que vale é a
   * linha gravada em `users`.
   */
  function user({ id = 'u1', role = 'analyst', companyId }) {
    const existing = db.get('SELECT * FROM users WHERE id = ?', String(id));

    if (existing) {
      if (existing.company_id !== companyId || existing.role !== role) {
        throw new Error(
          `Conflito de identidade no teste: '${id}' já provisionado como ` +
          `${existing.role}@${existing.company_id}; pedido ${role}@${companyId}`
        );
      }
      return { id: String(id), role, companyId };
    }

    createUser(db, { id, companyId, role });
    return { id: String(id), role, companyId };
  }

  return {
    db,
    gateway,
    companies: { acme: acme.id, globex: globex.id },
    user,
    suppliers: createSupplierService(db),
    approvals: createApprovalService(db),
    payments: createPaymentService({ db, gateway }),
    close() {
      db.close();
    }
  };
}

/**
 * Payload de usuário NÃO provisionado no banco — representa exatamente o que um
 * cliente hostil enviaria. Serve para provar que papel/empresa autodeclarados
 * não têm efeito algum (APR-2026-008 / Regra 24).
 */
function claimedUser({ id = 'desconhecido', role = 'manager', companyId = 1 } = {}) {
  return { id, role, companyId };
}

module.exports = { buildContext, claimedUser };
