# SIM-002 "PagaFácil" — API de Serviços

API programática (CommonJS). Todos os serviços são instanciados por fábrica e
recebem o handle de banco retornado por `openDatabase()`.

```js
const { openDatabase } = require('./src/db');
const { createSupplierService } = require('./src/supplierService');
const { createApprovalService } = require('./src/approvalService');
const { createPaymentService } = require('./src/paymentService');
const { createGatewayClient } = require('./src/gatewayClient');

const db = openDatabase('pagafacil.db');
const gateway = createGatewayClient();

const suppliers = createSupplierService(db);
const approvals = createApprovalService(db);
const payments = createPaymentService({ db, gateway });
```

O objeto `user` / `approver` esperado pelas operações tem o formato
`{ id, role, companyId }`, com `role` em `analyst` ou `manager`.

### Handle de banco (`openDatabase`)

Além de `raw`, `run`, `get`, `all` e `close`, o handle expõe:

- **`transaction(fn)`** — executa `fn` sob `BEGIN IMMEDIATE ... COMMIT`, com
  `ROLLBACK` automático em caso de erro, e devolve o valor de `fn`. `fn` **deve
  ser síncrona** (o driver `node:sqlite` é síncrono; um `await` interno devolveria
  o controle à fila de microtarefas e reabriria a janela TOCTOU). Funções
  assíncronas e transações aninhadas são rejeitadas com `TypeError`/`Error`.

`createSupplierService` e `createPaymentService` exigem um handle com
`transaction()`.

---

## `suppliers.createSupplier({ cnpj, name, companyId })`

Cadastra um fornecedor.

- **Papel exigido:** qualquer usuário autenticado da empresa.
- **Entrada:** `cnpj` (14 dígitos), `name` (texto), `companyId` (inteiro).
- **Saída:** registro do fornecedor com `status: "pending"` e `credit_limit: 0`.
- **Erros:** `CNPJ inválido`, `Nome do fornecedor é obrigatório`,
  `Empresa não encontrada`,
  `CNPJ já cadastrado para outro fornecedor` (BR-SUP-002 — unicidade **global**,
  aplicada mesmo quando o CNPJ já existe em outra empresa).
- **Garantias:** a verificação de duplicidade e o `INSERT` ocorrem na mesma
  transação; a unicidade é imposta pela constraint `UNIQUE` de `suppliers.cnpj`
  e a violação é convertida em erro de negócio (nunca vaza `SQLITE_CONSTRAINT`).
- **Referências:** REQ-SIM2-001, BR-SUP-002.

## `suppliers.getSupplier({ supplierId, user })`

Consulta um fornecedor da empresa do usuário.

- **Papel exigido:** `analyst` ou `manager` da empresa proprietária.
- **Entrada:** `supplierId` (inteiro), `user`.
- **Saída:** `{ id, company_id, cnpj, name, status, credit_limit, approved_by, approved_at, created_at }`.
- **Erros:** `Fornecedor não encontrado` (inclusive quando o fornecedor pertence
  a outra empresa).
- **Referências:** REQ-SIM2-006, BR-SEC-001.

## `approvals.approveSupplier({ supplierId, creditLimit, approver })`

Aprova um fornecedor e concede limite de crédito.

- **Papel exigido:** `analyst` (dentro da sua alçada) ou `manager`.
- **Entrada:** `supplierId`, `creditLimit` (número positivo), `approver`.
- **Saída:** fornecedor com `status: "approved"`, `credit_limit`, `approved_by`
  e `approved_at`.
- **Erros:** `Papel do aprovador não possui permissão de aprovação`,
  `Limite de crédito deve ser um valor positivo`, `Fornecedor não encontrado`,
  `Fornecedor já está aprovado`, `Limite de crédito acima da alçada do analista`.
- **Referências:** REQ-SIM2-002, BR-APR-001, BR-SEC-001.

## `payments.createPayment({ supplierId, amount, user })` *(async)*

Registra um pagamento para um fornecedor aprovado.

- **Papel exigido:** `manager`.
- **Entrada:** `supplierId`, `amount` (número positivo), `user`.
- **Saída:** pagamento com `status: "pending"`, `external_ref: null`.
- **Erros:** `Usuário não possui permissão para registrar pagamentos`,
  `Valor do pagamento deve ser positivo`, `Fornecedor não encontrado`,
  `Fornecedor não está aprovado para receber pagamentos`,
  `Pagamento excede o limite de crédito do fornecedor`.
- **Garantias:** a soma do valor comprometido, a validação do teto (BR-PAY-001) e
  o `INSERT` executam num único bloco `BEGIN IMMEDIATE ... COMMIT`. Chamadas
  concorrentes sobre o mesmo fornecedor são serializadas: o excedente é recusado,
  nunca persistido.
- **Referências:** REQ-SIM2-003, BR-SUP-001, BR-PAY-001, BR-SEC-001.

## `payments.sendPayment({ paymentId })` *(async)*

Envia o pagamento ao gateway externo.

- **Papel exigido:** operação de retaguarda (executada pelo processo de
  liquidação, sem interação de usuário).
- **Entrada:** `paymentId`.
- **Saída:** pagamento com `status: "sent"`, `external_ref` no formato
  `GW-NNNNNN` e `sent_at` preenchido. A chamada é registrada em
  `payment_attempts`.
- **Erros:** `Pagamento não encontrado`, `Pagamento cancelado não pode ser
  enviado`.
- **Idempotência (BR-PAY-002):** a operação é idempotente por pagamento.
  - Pagamento já em `sent` com `external_ref` preenchida: a chamada retorna o
    registro existente **sem** acionar o gateway.
  - Nos demais casos, o gateway recebe a chave de idempotência estável
    `SIM2-PAY-<paymentId>` e deduplica por ela: a mesma chave devolve sempre a
    mesma `externalRef`, sem nova movimentação financeira.
  - `external_ref` e `sent_at` já gravados nunca são sobrescritos (`COALESCE`).
  - `payment_attempts` registra no máximo **uma** tentativa `accepted` por
    pagamento (índice único parcial).
  - `INSERT` da tentativa e `UPDATE` do pagamento ocorrem na mesma transação.
- **Referências:** REQ-SIM2-004, BR-PAY-002.

## `payments.listPaymentsBySupplier({ supplierId, user })`

Lista os pagamentos de um fornecedor, restritos à empresa do usuário.

- **Papel exigido:** `analyst` ou `manager` da empresa proprietária.
- **Entrada:** `supplierId`, `user`.
- **Saída:** array de pagamentos ordenado por `created_at`.
- **Erros:** `Usuário inválido`.
- **Referências:** REQ-SIM2-005, BR-SEC-001.
