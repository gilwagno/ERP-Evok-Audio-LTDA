'use strict';

/**
 * Fonte confiável de identidade (APR-2026-008, Regra 24 do CLAUDE.md).
 *
 * Papel e empresa NUNCA são lidos do objeto recebido do chamador: o único dado
 * aproveitado do payload é `user.id`, e mesmo esse serve apenas como chave de
 * busca na tabela `users`. Qualquer `role`/`companyId` enviado pelo cliente é
 * ignorado — um chamador que se declare `manager` sendo `analyst` no banco é
 * tratado como `analyst`.
 */

/** Papéis autorizados a LER pagamentos e fornecedores (APR-2026-008). */
const READ_ROLES = Object.freeze(['analyst', 'manager']);

/** Papéis autorizados a ESCREVER pagamentos: criar e enviar (APR-2026-008). */
const PAYMENT_WRITE_ROLES = Object.freeze(['manager']);

/** Papéis reconhecidos pelo sistema (espelha o CHECK de `users.role`). */
const KNOWN_ROLES = Object.freeze(['analyst', 'manager']);

const INVALID_USER_MESSAGE = 'Usuário inválido';
const UNAUTHENTICATED_MESSAGE = 'Usuário não autenticado';

/**
 * Cria o resolvedor de identidade sobre um handle de banco.
 */
function createIdentityResolver(db) {
  if (!db || typeof db.get !== 'function') {
    throw new TypeError('createIdentityResolver: handle de banco inválido');
  }

  /**
   * Resolve o principal a partir do banco.
   *
   * @param {{id: *}} user objeto do chamador; somente `id` é considerado.
   * @returns {{id: string, companyId: number, role: string}} principal confiável.
   * @throws {Error} `Usuário inválido` quando não há sujeito identificável;
   *                 `Usuário não autenticado` quando o `id` não existe em `users`.
   */
  function resolve(user) {
    if (!user || user.id === undefined || user.id === null || String(user.id).trim() === '') {
      throw new Error(INVALID_USER_MESSAGE);
    }

    const row = db.get(
      'SELECT id, company_id, role FROM users WHERE id = ?',
      String(user.id)
    );

    if (!row) {
      // Falha de AUTENTICAÇÃO: id sem correspondência na fonte de identidade.
      throw new Error(UNAUTHENTICATED_MESSAGE);
    }
    if (!KNOWN_ROLES.includes(row.role)) {
      throw new Error(UNAUTHENTICATED_MESSAGE);
    }

    return { id: row.id, companyId: row.company_id, role: row.role };
  }

  /**
   * Resolve o principal e exige que seu papel (do BANCO) esteja entre os
   * permitidos para a operação.
   *
   * @param {object} user objeto do chamador.
   * @param {string[]} allowedRoles papéis aceitos.
   * @param {string} deniedMessage mensagem de negação da operação.
   */
  function authorize(user, allowedRoles, deniedMessage) {
    const principal = resolve(user);

    if (!allowedRoles.includes(principal.role)) {
      throw new Error(deniedMessage);
    }

    return principal;
  }

  return { resolve, authorize };
}

module.exports = {
  createIdentityResolver,
  READ_ROLES,
  PAYMENT_WRITE_ROLES,
  KNOWN_ROLES
};
