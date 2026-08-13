'use strict';

const PAYER_ROLES = ['analyst', 'manager'];

/**
 * Serviço de pagamentos a fornecedores.
 */
function createPaymentService({ db, gateway }) {
  if (!db || typeof db.transaction !== 'function') {
    throw new TypeError('createPaymentService: handle de banco sem primitiva transaction()');
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
  function loadSupplierInTenant(supplierId, user) {
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

  /**
   * Resolve o fornecedor da empresa do usuário e exige que esteja aprovado.
   *
   * SÍNCRONA por contrato: é chamada dentro de `db.transaction()`, que rejeita
   * blocos assíncronos (reabririam a janela TOCTOU que a transação fecha).
   */
  function loadApprovedSupplier(supplierId, user) {
    const supplier = loadSupplierInTenant(supplierId, user);

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
   */
  async function createPayment({ supplierId, amount, user }) {
    if (!user || !Number.isInteger(user.companyId) || !PAYER_ROLES.includes(user.role)) {
      throw new Error('Usuário não possui permissão para registrar pagamentos');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Valor do pagamento deve ser positivo');
    }

    const now = new Date().toISOString();

    // BR-PAY-001: ler-somar → validar → inserir precisa ser atômico. O bloco
    // abaixo é integralmente síncrono e roda sob BEGIN IMMEDIATE, fechando a
    // janela TOCTOU entre a leitura do comprometido e a gravação.
    const paymentId = db.transaction(() => {
      const supplier = loadApprovedSupplier(supplierId, user);
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
        String(user.id),
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
   */
  async function sendPayment({ paymentId }) {
    const payment = db.get('SELECT * FROM payments WHERE id = ?', paymentId);

    if (!payment) {
      throw new Error('Pagamento não encontrado');
    }
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

    const accepted = response.accepted ? 'accepted' : 'failed';

    // INSERT da tentativa + UPDATE do pagamento são uma única unidade atômica.
    db.transaction(() => {
      const alreadyAccepted = accepted === 'accepted'
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
          response.externalRef,
          accepted,
          now
        );
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
   */
  function listPaymentsBySupplier({ supplierId, user }) {
    if (!user || !Number.isInteger(user.companyId)) {
      throw new Error('Usuário inválido');
    }

    // Fornecedor de outra empresa é indistinguível de inexistente.
    loadSupplierInTenant(supplierId, user);

    return db.all(
      `SELECT * FROM payments
        WHERE supplier_id = ?
          AND company_id = ?
        ORDER BY created_at, id`,
      supplierId,
      user.companyId
    );
  }

  /**
   * Cancela um pagamento.
   */
  function cancelPayment({ paymentId }) {
    const payment = db.get('SELECT * FROM payments WHERE id = ?', paymentId);

    if (!payment) {
      throw new Error('Pagamento não encontrado');
    }

    if (payment.status === 'sent') {
      db.run(`UPDATE payments SET status = 'created', sent_at = NULL WHERE id = ?`, payment.id);
    } else {
      db.run(`UPDATE payments SET status = 'cancelled' WHERE id = ?`, payment.id);
    }

    return db.get('SELECT * FROM payments WHERE id = ?', payment.id);
  }

  return { createPayment, sendPayment, listPaymentsBySupplier, cancelPayment };
}

module.exports = { createPaymentService };
