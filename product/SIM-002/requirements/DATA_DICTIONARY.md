# SIM-002 "PagaFácil" — Dicionário de Dados

Banco relacional SQLite (`node:sqlite`). Tipos declarados conforme afinidade
SQLite. Todas as chaves primárias são inteiras autoincrementais.

---

## companies

Empresas (tenants) que operam no sistema.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | INTEGER | PK | Identificador da empresa. |
| `name` | TEXT | NOT NULL | Razão social da empresa. |
| `created_at` | TEXT | NOT NULL | Data/hora de criação (ISO 8601). |

## users

Fonte confiável de identidade (APR-2026-008 / Regra 24 do `CLAUDE.md`). Papel e
empresa do usuário existem **apenas aqui**: nenhum serviço aceita `role` ou
`companyId` vindos do payload do chamador.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | TEXT | PK | Identificador do usuário; é a única informação aproveitada do payload. |
| `company_id` | INTEGER | NOT NULL, FK → `companies.id` | Empresa à qual o usuário pertence (BR-SEC-001). |
| `role` | TEXT | NOT NULL, CHECK `IN ('analyst','manager')` | Papel do usuário. Escrita de pagamento exige `manager`; leitura admite `analyst` e `manager` (APR-2026-008). |
| `created_at` | TEXT | NOT NULL | Data/hora de provisionamento (ISO 8601). |

**Índices**

- `idx_users_company` (`company_id`) — não único.

## suppliers

Fornecedores cadastrados, sempre vinculados a uma empresa.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | INTEGER | PK | Identificador do fornecedor. |
| `company_id` | INTEGER | NOT NULL, FK → `companies.id` | Empresa proprietária do cadastro (BR-SEC-001). |
| `cnpj` | TEXT | **UNIQUE**, NOT NULL | CNPJ do fornecedor; identificador único no sistema (BR-SUP-002). |
| `name` | TEXT | NOT NULL | Razão social do fornecedor. |
| `status` | TEXT | NOT NULL, default `pending` | Situação cadastral: `pending`, `approved`, `rejected` (BR-SUP-001). |
| `credit_limit` | REAL | NOT NULL, default `0` | Limite de crédito aprovado, em reais (BR-APR-001, BR-PAY-001). |
| `approved_by` | TEXT | NULL | Identificador do usuário aprovador. |
| `approved_at` | TEXT | NULL | Data/hora da aprovação (ISO 8601). |
| `created_at` | TEXT | NOT NULL | Data/hora do cadastro (ISO 8601). |

## payments

Pagamentos registrados para um fornecedor.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | INTEGER | PK | Identificador do pagamento. |
| `supplier_id` | INTEGER | NOT NULL, FK → `suppliers.id` | Fornecedor destinatário. |
| `company_id` | INTEGER | NOT NULL, FK → `companies.id` | Empresa pagadora (BR-SEC-001). |
| `amount` | REAL | NOT NULL | Valor do pagamento, em reais; deve ser positivo. |
| `status` | TEXT | NOT NULL, default `created`, CHECK `IN ('created','sent','cancelled','failed')` | Situação do pagamento: `created` (registrado, não enviado), `sent` (aceito pelo gateway), `cancelled` (cancelado antes do envio — APR-2026-007), `failed` (**recusado pelo gateway** — APR-2026-009; causa distinta de cancelamento, rastreada separadamente). |
| `external_ref` | TEXT | NULL | Referência devolvida pelo gateway após o envio. |
| `created_by` | TEXT | NOT NULL | Identificador do usuário que registrou o pagamento. |
| `created_at` | TEXT | NOT NULL | Data/hora do registro (ISO 8601). |
| `sent_at` | TEXT | NULL | Data/hora do envio ao gateway (ISO 8601). Permanece nula sob recusa (`failed`): não houve envio. |

**Transições de estado válidas (APR-2026-007 / APR-2026-009)**

- `created → cancelled` — cancelamento antes do envio.
- `created → sent` / `failed → sent` — gateway aceitou.
- `created → failed` / `failed → failed` — gateway recusou.
- `sent → *` — **nenhuma**. Envio aceito é fato irreversível neste escopo;
  reverter seria estorno, operação fora do SIM-002.

## payment_attempts

Trilha das chamadas efetuadas ao gateway de pagamento.

| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | INTEGER | PK | Identificador da tentativa. |
| `payment_id` | INTEGER | NOT NULL, FK → `payments.id` | Pagamento correspondente. |
| `external_ref` | TEXT | NULL | Referência externa retornada na tentativa. |
| `result` | TEXT | NOT NULL | Resultado da chamada: `accepted` ou `failed`. |
| `attempted_at` | TEXT | NOT NULL | Data/hora da chamada (ISO 8601). |

**Índices e constraints**

- `idx_payment_attempts_payment` (`payment_id`) — não único.
- `uq_payment_attempts_accepted` — índice **único parcial** sobre `payment_id`
  com `WHERE result = 'accepted'`: no máximo uma tentativa aceita por pagamento
  (BR-PAY-002, defesa em profundidade). Tentativas `failed` permanecem sem
  restrição para preservar a trilha de retentativas.

**Uso normativo (BR-PAY-005 / APR-2026-013)**

As linhas com `result = 'failed'` são a **contagem oficial e persistente** de
submissões recusadas de um pagamento. O limite de reenvio (máximo 3 reenvios,
teto de 4 submissões por pagamento) é avaliado por essa contagem — não existe
coluna contadora em `payments`. A escolha é deliberada: um contador separado
seria uma segunda representação do mesmo fato e poderia divergir da trilha.
Consequência operacional: **apagar linhas desta tabela reabre o direito de
reenvio**; a tabela é trilha de auditoria e não deve sofrer expurgo sem decisão
registrada.
