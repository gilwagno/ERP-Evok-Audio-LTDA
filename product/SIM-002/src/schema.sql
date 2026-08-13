PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- APR-2026-008 (via Regra 24 do CLAUDE.md): papel e empresa do usuário são
-- atributos DO SERVIDOR. Esta tabela é a fonte confiável de identidade; nenhum
-- serviço aceita `role`/`companyId` vindos do payload do chamador.
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('analyst', 'manager')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL,
  -- BR-SUP-002: unicidade GLOBAL de CNPJ, independentemente da empresa.
  cnpj         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  credit_limit REAL NOT NULL DEFAULT 0,
  approved_by  TEXT,
  approved_at  TEXT,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER NOT NULL,
  company_id   INTEGER NOT NULL,
  amount       REAL NOT NULL,
  -- APR-2026-009: `failed` integra o domínio — recusa do gateway é causa
  -- distinta de cancelamento e precisa ser rastreável separadamente.
  status       TEXT NOT NULL DEFAULT 'created'
               CHECK (status IN ('created', 'sent', 'cancelled', 'failed')),
  external_ref TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  sent_at      TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
  FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id   INTEGER NOT NULL,
  external_ref TEXT,
  result       TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (payment_id) REFERENCES payments (id)
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users (company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers (company_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier ON payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts (payment_id);

-- BR-PAY-002 (defesa em profundidade): no máximo UMA tentativa aceita por
-- pagamento. Tentativas falhas permanecem sem restrição para preservar a trilha.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_accepted
  ON payment_attempts (payment_id)
  WHERE result = 'accepted';
