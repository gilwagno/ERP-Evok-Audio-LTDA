'use strict';

/**
 * Cliente do gateway externo de pagamentos.
 *
 * Implementação determinística em memória usada pelo simulado: registra cada
 * chamada recebida e devolve uma referência externa sequencial.
 */
function createGatewayClient({ prefix = 'GW' } = {}) {
  const calls = [];
  const refsByIdempotencyKey = new Map();
  let sequence = 0;

  /**
   * Submete um pagamento ao gateway.
   *
   * BR-PAY-002: a operação é idempotente por `idempotencyKey`. Uma segunda
   * submissão com a mesma chave NÃO produz nova movimentação: devolve a mesma
   * `externalRef`, sem incrementar a sequência e sem registrar nova chamada.
   * Na ausência de chave explícita, o gateway deduplica por `paymentId`.
   */
  async function submitPayment({ paymentId, amount, currency = 'BRL', idempotencyKey }) {
    if (!paymentId) {
      throw new Error('paymentId é obrigatório');
    }
    if (!(amount > 0)) {
      throw new Error('amount deve ser positivo');
    }

    const key = typeof idempotencyKey === 'string' && idempotencyKey.trim() !== ''
      ? idempotencyKey
      : `payment:${paymentId}`;

    if (refsByIdempotencyKey.has(key)) {
      return {
        accepted: true,
        externalRef: refsByIdempotencyKey.get(key),
        deduplicated: true
      };
    }

    sequence += 1;
    const externalRef = `${prefix}-${String(sequence).padStart(6, '0')}`;
    refsByIdempotencyKey.set(key, externalRef);
    calls.push({ paymentId, amount, currency, externalRef, idempotencyKey: key });

    return { accepted: true, externalRef, deduplicated: false };
  }

  return {
    submitPayment,
    callCount() {
      return calls.length;
    },
    callsFor(paymentId) {
      return calls.filter((call) => call.paymentId === paymentId);
    },
    history() {
      return calls.slice();
    },
    reset() {
      calls.length = 0;
      refsByIdempotencyKey.clear();
      sequence = 0;
    }
  };
}

module.exports = { createGatewayClient };
