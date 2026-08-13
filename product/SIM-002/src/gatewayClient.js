'use strict';

/**
 * Cliente do gateway externo de pagamentos.
 *
 * Implementação determinística em memória usada pelo simulado: registra cada
 * chamada recebida e devolve uma referência externa sequencial.
 *
 * @param {object} [options]
 * @param {string} [options.prefix='GW'] prefixo da referência externa.
 * @param {Function} [options.decide] política de decisão do gateway
 *   (FIND-SIM-002-009): recebe `{ paymentId, amount, currency, idempotencyKey }`
 *   e devolve `true` (aceite) ou `false` (recusa). Ausente, o gateway aceita —
 *   preservando o comportamento anterior. Existe para que o caminho de RECUSA
 *   seja exercitável em teste sem substituir o cliente por um duplo ad hoc.
 */
function createGatewayClient({ prefix = 'GW', decide } = {}) {
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

    const accepted = typeof decide === 'function'
      ? decide({ paymentId, amount, currency, idempotencyKey: key }) !== false
      : true;

    // Recusa não gera referência externa e não é memoizada por chave: a
    // retentativa de um pagamento recusado é uma nova submissão legítima.
    if (!accepted) {
      calls.push({ paymentId, amount, currency, externalRef: null, idempotencyKey: key, accepted: false });
      return { accepted: false, externalRef: null, deduplicated: false };
    }

    sequence += 1;
    const externalRef = `${prefix}-${String(sequence).padStart(6, '0')}`;
    refsByIdempotencyKey.set(key, externalRef);
    calls.push({ paymentId, amount, currency, externalRef, idempotencyKey: key, accepted: true });

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
