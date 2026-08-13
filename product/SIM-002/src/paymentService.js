'use strict';

const {
  createIdentityResolver,
  READ_ROLES,
  PAYMENT_WRITE_ROLES
} = require('./identity');

const CREATE_DENIED_MESSAGE = 'Usuário não possui permissão para registrar pagamentos';
const SEND_DENIED_MESSAGE = 'Usuário não possui permissão para enviar pagamentos';
const READ_DENIED_MESSAGE = 'Usuário não possui permissão para consultar pagamentos';
const CANCEL_DENIED_MESSAGE = 'Usuário não possui permissão para cancelar pagamentos';
const CANCEL_SENT_MESSAGE =
  'Pagamento já enviado não pode ser cancelado; estorno é operação distinta';
const CANCEL_STATE_MESSAGE = 'Somente pagamento em "created" pode ser cancelado';

/**
 * Serviço de pagamentos a fornecedores.
 */
function createPaymentService({ db, gateway }) {
  if (!db || typeof db.transaction !== 'function') {
    throw new TypeError('createPaymentService: handle de banco sem primitiva transaction()');
  }

  // APR-2026-008: papel e empresa vêm do banco, nunca do payload do chamador.
  const identity = createIdentityResolver(db);

  /**
   * Carrega um pagamento da empresa do principal (BR-SEC-001).
   * Pagamento de outra empresa é indistinguível de inexistente.
   */
  function loadPaymentInTenant(paymentId, principal) {
    const payment = db.get(
      'SELECT * FROM payments WHERE id = ? AND company_id = ?',
      paymentId,
      principal.companyId
    );

    if (!payment) {
      throw new Error('Pagamento não encontrado');
    }

    return payment;
  }

  /**
   * Chave de idempotência estável derivada do pagamento (BR-PAY-002).
   * Depende apenas da identidade do pagamento, de modo que qualquer
   * retentativa resolva para a mesma movimentação no gateway.
   */
  function idempotencyKeyFor(payment) {
    return `SIM2-PAY-${payment.id}`;
  }

  /**
   * Único ponto de resolução de fornecedor no serviço: impõe BR-SEC-001
   * amarrando o fornecedor à empresa do usuário. Erro genérico para não
   * revelar a existência de fornecedores de outras empresas.
   */
  function loadSupplierInTenant(supplierId, principal) {
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

  /**
   * Resolve o fornecedor da empresa do usuário e exige que esteja aprovado.
   *
   * SÍNCRONA por contrato: é chamada dentro de `db.transaction()`, que rejeita
   * blocos assíncronos (reabririam a janela TOCTOU que a transação fecha).
   */
  function loadApprovedSupplier(supplierId, principal) {
    const supplier = loadSupplierInTenant(supplierId, principal);

    if (supplier.status !== 'approved') {
      throw new Error('Fornecedor não está aprovado para receber pagamentos');
    }

    return supplier;
  }

  function sumCommittedAmount(supplierId) {
    const row = db.get(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments
        WHERE supplier_id = ?
          AND status <> 'cancelled'`,
      supplierId
    );
    return row.total;
  }

  /**
   * Registra um pagamento para um fornecedor aprovado.
   *
   * APR-2026-008: escrita de pagamento é privativa de `manager`, verificado
   * contra `users` — o `role` do payload é irrelevante.
   */
  async function createPayment({ supplierId, amount, user }) {
    const principal = identity.authorize(user, PAYMENT_WRITE_ROLES, CREATE_DENIED_MESSAGE);

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Valor do pagamento deve ser positivo');
    }

    const now = new Date().toISOString();

    // BR-PAY-001: ler-somar → validar → inserir precisa ser atômico. O bloco
    // abaixo é integralmente síncrono e roda sob BEGIN IMMEDIATE, fechando a
    // janela TOCTOU entre a leitura do comprometido e a gravação.
    const paymentId = db.transaction(() => {
      const supplier = loadApprovedSupplier(supplierId, principal);
      const committed = sumCommittedAmount(supplierId);

      if (committed + amount > supplier.credit_limit) {
        throw new Error('Pagamento excede o limite de crédito do fornecedor');
      }

      const result = db.run(
        `INSERT INTO payments (supplier_id, company_id, amount, status, created_by, created_at)
         VALUES (?, ?, ?, 'created', ?, ?)`,
        supplierId,
        supplier.company_id,
        amount,
        String(principal.id),
        now
      );

      return Number(result.lastInsertRowid);
    });

    return db.get('SELECT * FROM payments WHERE id = ?', paymentId);
  }

  /**
   * Envia um pagamento registrado ao gateway externo.
   *
   * Idempotente por BR-PAY-002: um pagamento já enviado reaproveita o envio
   * anterior (mesma `external_ref`, mesmo `sent_at`) sem nova movimentação.
   *
   * APR-2026-008: exige sujeito com papel `manager` (verificado no banco) e
   * respeita BR-SEC-001 — só se envia pagamento da própria empresa.
   * APR-2026-009: recusa do gateway leva o pagamento a `failed`, nunca a `sent`.
   */
  async function sendPayment({ paymentId, user }) {
    const principal = identity.authorize(user, PAYMENT_WRITE_ROLES, SEND_DENIED_MESSAGE);
    const payment = loadPaymentInTenant(paymentId, principal);

    if (payment.status === 'cancelled') {
      throw new Error('Pagamento cancelado não pode ser enviado');
    }

    // BR-PAY-002 — curto-circuito ANTES de tocar o gateway: envio já realizado
    // devolve a referência externa e o instante já gravados.
    if (payment.status === 'sent' && payment.external_ref) {
      return payment;
    }

    const now = new Date().toISOString();
    const response = await gateway.submitPayment({
      paymentId: payment.id,
      amount: payment.amount,
      idempotencyKey: idempotencyKeyFor(payment)
    });

    const acceptedByGateway = response.accepted === true;
    const attemptResult = acceptedByGateway ? 'accepted' : 'failed';

    // INSERT da tentativa + UPDATE do pagamento são uma única unidade atômica.
    db.transaction(() => {
      const alreadyAccepted = acceptedByGateway
        ? db.get(
          `SELECT id FROM payment_attempts
            WHERE payment_id = ? AND result = 'accepted'`,
          payment.id
        )
        : undefined;

      // Uma tentativa aceita por pagamento (índice único parcial em
      // payment_attempts); tentativas repetidas não duplicam a trilha.
      if (!alreadyAccepted) {
        db.run(
          `INSERT INTO payment_attempts (payment_id, external_ref, result, attempted_at)
           VALUES (?, ?, ?, ?)`,
          payment.id,
          acceptedByGateway ? response.externalRef : null,
          attemptResult,
          now
        );
      }

      if (!acceptedByGateway) {
        // APR-2026-009: o estado persistido reflete o resultado REAL da
        // integração. Nada de `external_ref`/`sent_at` — não houve envio.
        db.run(
          `UPDATE payments SET status = 'failed' WHERE id = ?`,
          payment.id
        );
        return;
      }

      // COALESCE preserva a referência e o instante do primeiro envio:
      // `external_ref` não nula nunca é sobrescrita.
      db.run(
        `UPDATE payments
            SET status = 'sent',
                external_ref = COALESCE(external_ref, ?),
                sent_at = COALESCE(sent_at, ?)
          WHERE id = ?`,
        response.externalRef,
        now,
        payment.id
      );
    });

    return db.get('SELECT * FROM payments WHERE id = ?', payment.id);
  }

  /**
   * Lista os pagamentos de um fornecedor da empresa do usuário (BR-SEC-001).
   *
   * APR-2026-008: leitura permitida a `analyst` e `manager`, papel verificado
   * no banco.
   */
  function listPaymentsBySupplier({ supplierId, user }) {
    const principal = identity.authorize(user, READ_ROLES, READ_DENIED_MESSAGE);

    // Fornecedor de outra empresa é indistinguível de inexistente.
    loadSupplierInTenant(supplierId, principal);

    return db.all(
      `SELECT * FROM payments
        WHERE supplier_id = ?
          AND company_id = ?
        ORDER BY created_at, id`,
      supplierId,
      principal.companyId
    );
  }

  /**
   * Cancela um pagamento AINDA NÃO ENVIADO.
   *
   * APR-2026-007: cancelamento vale exclusivamente para `created`. Pagamento em
   * `sent` NÃO é cancelável — desfazer envio já liquidado seria estorno,
   * operação distinta e fora do escopo. A antiga transição `sent → created`
   * (que zerava `sent_at` mantendo `external_ref`) foi removida.
   *
   * APR-2026-008/BR-SEC-001: exige sujeito autenticado e só alcança pagamento
   * da própria empresa.
   */
  function cancelPayment({ paymentId, user }) {
    const principal = identity.authorize(user, READ_ROLES, CANCEL_DENIED_MESSAGE);
    const payment = loadPaymentInTenant(paymentId, principal);

    if (payment.status === 'sent') {
      throw new Error(CANCEL_SENT_MESSAGE);
    }
    if (payment.status !== 'created') {
      throw new Error(CANCEL_STATE_MESSAGE);
    }

    db.run(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, payment.id);

    return db.get('SELECT * FROM payments WHERE id = ?', payment.id);
  }

  return { createPayment, sendPayment, listPaymentsBySupplier, cancelPayment };
}

module.exports = { createPaymentService };
