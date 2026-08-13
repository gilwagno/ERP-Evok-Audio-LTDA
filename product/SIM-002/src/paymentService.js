'use strict';

const {
  createIdentityResolver,
  READ_ROLES,
  PAYMENT_WRITE_ROLES,
  PAYMENT_CANCEL_ROLES
} = require('./identity');

/**
 * APR-2026-013 — limite de retentativa de pagamento em `failed`.
 *
 * A decisão humana é "limite de 3 tentativas de REENVIO ao gateway para um
 * pagamento em `failed`". O envio original não é reenvio: ele é o que leva o
 * pagamento a `failed`. Logo o teto de submissões ao gateway por pagamento é
 * `1 + 3 = 4`, e a 4ª retentativa (5ª chamada) é recusada pelo SERVIÇO, sem
 * tocar o gateway.
 *
 * O limite incide sobre chamadas EXPLÍCITAS de `sendPayment`: não há, e não
 * deve haver, retentativa automática (a decisão veda "retentativa automática
 * ilimitada"; este serviço não implementa retentativa automática alguma).
 */
const MAX_RESEND_ATTEMPTS = 3;
const MAX_GATEWAY_SUBMISSIONS = 1 + MAX_RESEND_ATTEMPTS;

const CREATE_DENIED_MESSAGE = 'Usuário não possui permissão para registrar pagamentos';
const SEND_DENIED_MESSAGE = 'Usuário não possui permissão para enviar pagamentos';
const READ_DENIED_MESSAGE = 'Usuário não possui permissão para consultar pagamentos';
const CANCEL_DENIED_MESSAGE = 'Usuário não possui permissão para cancelar pagamentos';
const CANCEL_SENT_MESSAGE =
  'Pagamento já enviado não pode ser cancelado; estorno é operação distinta';
const CANCEL_STATE_MESSAGE = 'Somente pagamento em "created" pode ser cancelado';
const RETRY_EXHAUSTED_MESSAGE =
  `Pagamento em falha definitiva: limite de ${MAX_RESEND_ATTEMPTS} reenvios ao gateway ` +
  'esgotado; reenvio automático não será feito e a regularização exige ação manual';

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

  /**
   * Quantas submissões deste pagamento ao gateway terminaram em recusa.
   *
   * APR-2026-013: a contagem é PERSISTENTE e sai da trilha `payment_attempts`,
   * que já existe e já registra exatamente o evento limitado (uma linha por
   * submissão). Optou-se por derivar da trilha em vez de criar uma coluna
   * `retry_count` em `payments` justamente para não ter dois registros da mesma
   * verdade — um contador e uma trilha — que podem divergir; a trilha é o fato,
   * o contador seria uma cópia dele. Como a trilha sobrevive ao processo, o
   * limite vale entre execuções, e não apenas dentro de uma sessão.
   */
  function countFailedAttempts(paymentId) {
    const row = db.get(
      `SELECT COUNT(*) AS total FROM payment_attempts
        WHERE payment_id = ? AND result = 'failed'`,
      paymentId
    );
    return row.total;
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

    // APR-2026-013: pagamento em `failed` que já esgotou o limite de reenvios é
    // `failed` DEFINITIVO. A recusa acontece ANTES de tocar o gateway e antes de
    // qualquer escrita: nenhuma nova linha em `payment_attempts`, nenhuma
    // mudança de status — o pagamento permanece `failed`.
    if (payment.status === 'failed'
      && countFailedAttempts(payment.id) >= MAX_GATEWAY_SUBMISSIONS) {
      throw new Error(RETRY_EXHAUSTED_MESSAGE);
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
   *
   * APR-2026-012: cancelar é privativo de `manager`, papel verificado no BANCO.
   * `analyst` é recusado ainda que seja da empresa correta — cancelar libera
   * crédito comprometido (`sumCommittedAmount`) e por isso tem a mesma alçada
   * das demais escritas de pagamento.
   */
  function cancelPayment({ paymentId, user }) {
    const principal = identity.authorize(user, PAYMENT_CANCEL_ROLES, CANCEL_DENIED_MESSAGE);
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

module.exports = { createPaymentService, MAX_RESEND_ATTEMPTS, MAX_GATEWAY_SUBMISSIONS };
