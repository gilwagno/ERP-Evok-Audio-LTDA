'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Abre a base de dados e garante que o schema esteja aplicado.
 *
 * @param {string} [location] caminho do arquivo SQLite; ':memory:' por padrão.
 * @returns {object} handle com helpers de acesso.
 */
function openDatabase(location = ':memory:') {
  const database = new DatabaseSync(location);
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  database.exec(schema);

  let inTransaction = false;

  return {
    raw: database,

    run(sql, ...params) {
      return database.prepare(sql).run(...params);
    },

    get(sql, ...params) {
      return database.prepare(sql).get(...params);
    },

    all(sql, ...params) {
      return database.prepare(sql).all(...params);
    },

    /**
     * Executa `fn` dentro de uma transação imediata (BEGIN IMMEDIATE ... COMMIT),
     * com ROLLBACK em caso de erro.
     *
     * `fn` DEVE ser síncrona: o driver (`node:sqlite`) é síncrono e qualquer
     * `await` dentro do bloco devolveria o controle à fila de microtarefas,
     * reabrindo a janela TOCTOU que a transação existe para fechar.
     * Transações aninhadas são rejeitadas explicitamente.
     *
     * @param {Function} fn bloco crítico síncrono.
     * @returns {*} o valor devolvido por `fn`.
     */
    transaction(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('transaction(fn): fn deve ser uma função síncrona');
      }
      if (inTransaction) {
        throw new Error('Transação aninhada não é suportada');
      }

      database.exec('BEGIN IMMEDIATE');
      inTransaction = true;

      let result;
      try {
        result = fn();
      } catch (error) {
        try {
          database.exec('ROLLBACK');
        } finally {
          inTransaction = false;
        }
        throw error;
      }

      if (result && typeof result.then === 'function') {
        try {
          database.exec('ROLLBACK');
        } finally {
          inTransaction = false;
        }
        throw new TypeError('transaction(fn): fn não pode ser assíncrona');
      }

      try {
        database.exec('COMMIT');
      } catch (error) {
        try {
          database.exec('ROLLBACK');
        } catch {
          // COMMIT falhou e a transação já não está ativa; nada a desfazer.
        }
        inTransaction = false;
        throw error;
      }

      inTransaction = false;
      return result;
    },

    close() {
      database.close();
    }
  };
}

/**
 * Cria uma empresa (tenant) e devolve o registro persistido.
 */
function createCompany(db, name, now = new Date().toISOString()) {
  const result = db.run(
    'INSERT INTO companies (name, created_at) VALUES (?, ?)',
    name,
    now
  );
  return db.get('SELECT * FROM companies WHERE id = ?', Number(result.lastInsertRowid));
}

/**
 * Provisiona um usuário na fonte confiável de identidade (APR-2026-008).
 *
 * Papel e empresa passam a existir somente aqui — nenhum serviço aceita esses
 * atributos vindos do chamador.
 *
 * @param {object} db handle de banco.
 * @param {{id: string, companyId: number, role: 'analyst'|'manager'}} spec
 * @returns {object} registro persistido de `users`.
 */
function createUser(db, { id, companyId, role }, now = new Date().toISOString()) {
  db.run(
    'INSERT INTO users (id, company_id, role, created_at) VALUES (?, ?, ?, ?)',
    String(id),
    companyId,
    role,
    now
  );
  return db.get('SELECT * FROM users WHERE id = ?', String(id));
}

module.exports = { openDatabase, createCompany, createUser };
