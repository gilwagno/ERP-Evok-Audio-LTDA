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

## Identidade e papéis (APR-2026-008, estendida por APR-2026-011 e APR-2026-012)

O objeto `user` enviado pelo chamador é aceito no formato `{ id, ... }`, mas
**somente `id` é considerado**. Papel (`role`) e empresa (`companyId`) são
resolvidos no servidor, a cada chamada, na tabela `users` — qualquer `role` ou
`companyId` presente no payload é **ignorado** (Regra 24 do `CLAUDE.md`). Um
`user.id` sem correspondência em `users` é erro de autenticação
(`Usuário não autenticado`); a ausência de sujeito é `Usuário inválido`.

Provisionamento de identidade: `createUser(db, { id, companyId, role })` de
`src/db.js`.

O mesmo vale para o objeto `approver` de `approvals.approveSupplier`: desde a
APR-2026-011 ele é resolvido pelo **mesmo** `identity.js` das operações de
pagamento. Não existe segundo caminho de identidade no produto.

**Matriz de autorização aprovada (APR-2026-008 + 011 + 012):**

| Operação | Natureza | Papéis permitidos |
|---|---|---|
| `payments.createPayment` | escrita | `manager` |
| `payments.sendPayment` | escrita | `manager` |
| `payments.cancelPayment` | escrita | `manager` (APR-2026-012 — `analyst` recusado mesmo sendo da empresa proprietária) |
| `approvals.approveSupplier` | escrita | `analyst` até R$ 10.000,00 inclusive; `manager` sem teto (APR-2026-011 + BR-APR-001) |
| `payments.listPaymentsBySupplier` | leitura | `analyst`, `manager` |
| `suppliers.getSupplier` | leitura | `analyst`, `manager` |
| `suppliers.createSupplier` | escrita de cadastro | `analyst`, `manager` (nenhuma BR restringe) |

Em todas as operações vale BR-SEC-001: o alcance é limitado à empresa do
usuário resolvida no banco.

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

## `suppliers.createSupplier({ cnpj, name, user, companyId? })`

Cadastra um fornecedor na empresa do usuário.

- **Papel exigido:** qualquer usuário autenticado (`analyst` ou `manager`),
  verificado em `users`.
- **Entrada:** `cnpj` (14 dígitos), `name` (texto), `user` (obrigatório);
  `companyId` é opcional e, se informado, deve ser igual à empresa do usuário —
  a empresa de destino é sempre derivada da identidade do usuário, nunca do
  parâmetro.
- **Saída:** registro do fornecedor na empresa do usuário, com
  `status: "pending"` e `credit_limit: 0`.
- **Erros:** `Usuário inválido` (chamada sem sujeito),
  `Usuário não autenticado` (`user.id` inexistente em `users`),
  `Cadastro de fornecedor em outra empresa não é permitido`
  (`companyId` divergente da empresa do usuário), `CNPJ inválido`,
  `Nome do fornecedor é obrigatório`, `Empresa não encontrada`,
  `CNPJ já cadastrado para outro fornecedor` (BR-SUP-002 — unicidade **global**,
  aplicada mesmo quando o CNPJ já existe em outra empresa).
- **Garantias:** a verificação de duplicidade e o `INSERT` ocorrem na mesma
  transação; a unicidade é imposta pela constraint `UNIQUE` de `suppliers.cnpj`
  e a violação é convertida em erro de negócio (nunca vaza `SQLITE_CONSTRAINT`).
- **Referências:** REQ-SIM2-001, BR-SUP-002, BR-SEC-001.

## `suppliers.getSupplier({ supplierId, user })`

Consulta um fornecedor da empresa do usuário.

- **Papel exigido:** `analyst` ou `manager` da empresa proprietária —
  **verificado em `users`** (APR-2026-008; antes o papel era declarado neste
  contrato e não era conferido).
- **Entrada:** `supplierId` (inteiro), `user` (apenas `user.id` é considerado).
- **Saída:** `{ id, company_id, cnpj, name, status, credit_limit, approved_by, approved_at, created_at }`.
- **Erros:** `Usuário inválido`, `Usuário não autenticado`,
  `Usuário não possui permissão para consultar fornecedores`,
  `Fornecedor não encontrado` (inclusive quando o fornecedor pertence
  a outra empresa).
- **Referências:** REQ-SIM2-006, BR-SEC-001.

## `approvals.approveSupplier({ supplierId, creditLimit, approver })`

Aprova um fornecedor e concede limite de crédito.

- **Papel exigido:** `analyst` para `creditLimit` até R$ 10.000,00 **inclusive**;
  acima desse valor, exclusivamente `manager` (BR-APR-001). O papel é
  **verificado em `users`** (APR-2026-011): declarar `role: 'manager'` no
  payload não altera a alçada de quem é `analyst` no banco.
- **Entrada:** `supplierId`, `creditLimit` (número positivo), `approver` —
  **apenas `approver.id` é considerado**; `role` e `companyId` do payload são
  ignorados.
- **Saída:** fornecedor com `status: "approved"`, `credit_limit`, `approved_by`
  e `approved_at`. `approved_by` recebe a **identidade resolvida** (texto, igual
  a `users.id`), nunca o identificador afirmado pelo chamador.
- **Erros:** `Usuário inválido` (chamada sem `approver`),
  `Usuário não autenticado` (`approver.id` inexistente em `users` — falha de
  **autenticação**, não de alçada),
  `Papel do aprovador não possui permissão de aprovação` (papel gravado fora de
  `analyst`/`manager`), `Limite de crédito deve ser um valor positivo`,
  `Fornecedor não encontrado` (inclusive quando pertence a outra empresa — a
  empresa considerada é a de `users`, não a do payload),
  `Fornecedor já está aprovado`, `Limite de crédito acima da alçada do analista`.
- **Referências:** REQ-SIM2-002, AC-SIM2-002b, BR-APR-001, BR-SEC-001,
  BR-SEC-003, APR-2026-011, FIND-SIM-002-014.

## `payments.createPayment({ supplierId, amount, user })` *(async)*

Registra um pagamento para um fornecedor aprovado.

- **Papel exigido:** `manager` (APR-2026-008), verificado em `users`. O código
  aceitava `analyst`+`manager` até a WAVE-D; agora está alinhado a este contrato.
- **Entrada:** `supplierId`, `amount` (número positivo), `user` (apenas `user.id`).
- **Saída:** pagamento com `status: "created"`, `external_ref: null`. Os status
  válidos de pagamento são `created`, `sent`, `cancelled` e `failed`
  (APR-2026-009); `pending` é status de **fornecedor**, não de pagamento.
- **Erros:** `Usuário inválido`, `Usuário não autenticado`,
  `Usuário não possui permissão para registrar pagamentos` (inclusive quando o
  papel gravado em `users` é `analyst`, ainda que o payload diga `manager`),
  `Valor do pagamento deve ser positivo`, `Fornecedor não encontrado`,
  `Fornecedor não está aprovado para receber pagamentos`,
  `Pagamento excede o limite de crédito do fornecedor`.
- **Garantias:** a soma do valor comprometido, a validação do teto (BR-PAY-001) e
  o `INSERT` executam num único bloco `BEGIN IMMEDIATE ... COMMIT`. Chamadas
  concorrentes sobre o mesmo fornecedor são serializadas: o excedente é recusado,
  nunca persistido.
- **Referências:** REQ-SIM2-003, BR-SUP-001, BR-PAY-001, BR-SEC-001.

## `payments.sendPayment({ paymentId, user })` *(async)*

Envia o pagamento ao gateway externo.

- **Papel exigido:** `manager` (APR-2026-008), verificado em `users`. A operação
  deixou de ser anônima: exige sujeito e respeita BR-SEC-001.
- **Entrada:** `paymentId`, `user` (apenas `user.id`).
- **Saída (aceite):** pagamento com `status: "sent"`, `external_ref` no formato
  `GW-NNNNNN` e `sent_at` preenchido. A chamada é registrada em
  `payment_attempts` com `result: "accepted"`.
- **Saída (recusa do gateway — APR-2026-009):** pagamento com
  `status: "failed"`, `external_ref` e `sent_at` **inalterados** (nulos, se
  nunca houve envio aceito), e tentativa registrada com `result: "failed"`. Um
  pagamento recusado **não** conta como enviado e pode ser reenviado **dentro do
  limite abaixo**; a trilha de tentativas preserva cada recusa.
- **Limite de reenvio (BR-PAY-005 / APR-2026-013):** um pagamento em `failed`
  admite no máximo **3 reenvios** (teto de **4** submissões ao gateway por
  pagamento, contando o envio original). Atingido o teto, o pagamento é `failed`
  **definitivo**: a chamada seguinte é recusada pelo próprio serviço, **sem
  tocar o gateway** e **sem registrar nova tentativa**, e o status permanece
  `failed`. A contagem sai da trilha persistente `payment_attempts` (linhas com
  `result = 'failed'`), portanto não se reinicia com reinício do processo nem
  com nova instância do serviço. **Não há reenvio automático**: o limite incide
  sobre chamadas explícitas. As constantes `MAX_RESEND_ATTEMPTS` (3) e
  `MAX_GATEWAY_SUBMISSIONS` (4) são exportadas por `src/paymentService.js`.
- **Erros:** `Usuário inválido`, `Usuário não autenticado`,
  `Usuário não possui permissão para enviar pagamentos`,
  `Pagamento não encontrado` (inclusive quando pertence a outra empresa),
  `Pagamento cancelado não pode ser enviado`,
  `Pagamento em falha definitiva: limite de 3 reenvios ao gateway esgotado;`
  `reenvio automático não será feito e a regularização exige ação manual`
  (BR-PAY-005).
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
- **Referências:** REQ-SIM2-004, AC-SIM2-004b, AC-SIM2-004c, BR-PAY-002,
  BR-PAY-004, BR-PAY-005, APR-2026-013, OBS-SIM-002-008-c.

## `payments.listPaymentsBySupplier({ supplierId, user })`

Lista os pagamentos de um fornecedor, restritos à empresa do usuário.

- **Papel exigido:** `analyst` ou `manager` da empresa proprietária —
  **verificado em `users`** (APR-2026-008).
- **Entrada:** `supplierId`, `user` (apenas `user.id`).
- **Saída:** array de pagamentos da empresa do usuário, ordenado por
  `created_at`. Todo item satisfaz `company_id === users.company_id` do
  chamador.
- **Erros:** `Usuário inválido`, `Usuário não autenticado`,
  `Usuário não possui permissão para consultar pagamentos`,
  `Fornecedor não encontrado` (inclusive quando o fornecedor pertence a outra
  empresa — erro genérico, sem oráculo de existência).
- **Referências:** REQ-SIM2-005, BR-SEC-001, APR-2026-008.

## `payments.cancelPayment({ paymentId, user })`

Cancela um pagamento **ainda não enviado**.

- **Regra de negócio (APR-2026-007):** cancelar vale **exclusivamente** para
  pagamento em `created`. Pagamento em `sent` **não é cancelável** — desfazer um
  envio já liquidado seria **estorno**, operação distinta e fora do escopo do
  SIM-002. A antiga transição `sent → created` (que zerava `sent_at` mantendo
  `external_ref`) foi removida.
- **Papel exigido (APR-2026-012):** exclusivamente `manager` da empresa
  proprietária, verificado em `users`. `analyst` é recusado **mesmo pertencendo
  à empresa correta** — a recusa é de papel, não de tenant, e ocorre antes de
  qualquer leitura do pagamento. A lacuna normativa antes registrada aqui
  (APR-2026-007 não arbitrar papel) está encerrada.
- **Entrada:** `paymentId`, `user` (apenas `user.id`).
- **Saída:** pagamento com `status: "cancelled"`.
- **Erros:** `Usuário inválido`, `Usuário não autenticado`,
  `Usuário não possui permissão para cancelar pagamentos`,
  `Pagamento não encontrado` (inclusive quando pertence a outra empresa),
  `Pagamento já enviado não pode ser cancelado; estorno é operação distinta`,
  `Somente pagamento em "created" pode ser cancelado` (por exemplo, pagamento
  já cancelado ou em `failed`).
  A recusa por papel usa a mesma mensagem
  `Usuário não possui permissão para cancelar pagamentos` tanto para `analyst`
  verdadeiro quanto para `analyst` que se declara `manager`.
- **Referências:** REQ-SIM2-007, AC-SIM2-007b, BR-PAY-003, BR-SEC-001,
  BR-SEC-003, APR-2026-007, APR-2026-012, OBS-SIM-002-007.

## `createGatewayClient({ prefix?, decide? })`

Cliente em memória do gateway.

- **`prefix`** — prefixo da referência externa (padrão `GW`).
- **`decide({ paymentId, amount, currency, idempotencyKey })`** — política de
  decisão. Devolvendo `false`, o gateway **recusa** a submissão
  (`{ accepted: false, externalRef: null }`), sem consumir a sequência e sem
  memoizar a chave. Ausente, o gateway aceita. Existe para tornar o caminho de
  recusa (APR-2026-009) exercitável em teste.
