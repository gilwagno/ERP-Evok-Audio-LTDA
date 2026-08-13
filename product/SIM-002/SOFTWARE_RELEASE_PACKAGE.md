# SOFTWARE_RELEASE_PACKAGE  (OpusCore → VeriCore)
PROJECT_ID: SIM-002
RELEASE_ID: SIM-002-RC1
VERSION: 0.1.0
COMMIT_HASH: (a preencher pelo CoreTriad Director no commit de entrega — vira AUDIT_COMMIT congelado)
SOURCE_BRANCH: main

PRODUCT_SPECIFICATION: Módulo "PagaFácil" de cadastro, aprovação e pagamento de fornecedores. Node.js CommonJS, zero dependências externas, persistência real em SQLite via `node:sqlite`. Ver `product/SIM-002/README.md`.
BUSINESS_PROCESS: Ciclo fornecedor → aprovação com alçada → registro de pagamento → envio ao gateway externo → consulta/listagem.
BUSINESS_RULES: BR-SUP-001, BR-SUP-002, BR-APR-001, BR-PAY-001, BR-PAY-002, BR-SEC-001 — `product/SIM-002/requirements/BUSINESS_RULES.md`
REQUIREMENTS: REQ-SIM2-001 .. REQ-SIM2-006 — `product/SIM-002/requirements/REQUIREMENTS.md`
NFRS: N/A neste ciclo (projeto simulado; sem NFRs formais definidos).
USE_CASES: Cobertos diretamente pelos REQs (cadastrar fornecedor, aprovar fornecedor, criar pagamento, enviar pagamento, listar pagamentos, consultar fornecedor); UCs formais não foram destacados neste ciclo.
ACCEPTANCE_CRITERIA: AC-SIM2-001 .. AC-SIM2-006 — `product/SIM-002/requirements/REQUIREMENTS.md`

ARCHITECTURE: Serviços CommonJS instanciados por fábrica sobre um handle único de banco (`openDatabase`). Camadas: `db.js` (acesso), `supplierService.js` / `approvalService.js` / `paymentService.js` (regras), `gatewayClient.js` (integração externa). Sem transporte HTTP.
ADRS: N/A (decisões impostas pelo escopo do simulado: SQLite nativo, zero dependências, runner `node:test`).
API_CONTRACTS: `product/SIM-002/docs/API.md` — `createSupplier`, `getSupplier`, `approveSupplier`, `createPayment`, `sendPayment`, `listPaymentsBySupplier`, `cancelPayment` (contratualizado na WAVE-D — APR-2026-007).
DATA_MODEL: Tabelas `companies`, `users` (fonte de identidade, WAVE-D/APR-2026-008), `suppliers`, `payments`, `payment_attempts` — `product/SIM-002/requirements/DATA_DICTIONARY.md`.
MIGRATIONS: DDL única aplicada na abertura da base — `product/SIM-002/src/schema.sql` (idempotente via `CREATE TABLE IF NOT EXISTS`).

SECURITY_REQUIREMENTS: BR-SEC-001 (isolamento por `company_id`), BR-APR-001 (alçada por papel), BR-SUP-001 (pagamento apenas a fornecedor aprovado).
THREAT_MODEL: N/A formal. Superfície limitada a chamadas programáticas; riscos considerados: acesso cruzado entre empresas e duplicidade de movimentação financeira no gateway.
AUTHORIZATION_MATRIX: (atualizada na remediação WAVE-D — APR-2026-008; papel e
empresa passam a ser resolvidos em `users`, nunca aceitos do payload)
  - Cadastrar fornecedor: usuário autenticado (`analyst`/`manager`) da empresa — permitido.
  - Aprovar fornecedor até a alçada de analista: `analyst`, `manager` — permitido; demais papéis — negado.
  - Aprovar fornecedor acima da alçada de analista: `manager` — permitido.
  - Criar pagamento: **somente `manager`** da empresa proprietária — permitido.
  - Enviar pagamento: **somente `manager`** da empresa proprietária — permitido (a operação deixou de ser anônima).
  - Cancelar pagamento: usuário autenticado da empresa proprietária, e apenas em `created` (APR-2026-007).
  - Consultar fornecedor / listar pagamentos: `analyst`, `manager` da empresa proprietária — permitido.
TEST_STRATEGY: Testes unitários/integrados com runner nativo `node:test`, base SQLite em memória isolada por teste, um arquivo por área funcional em `product/SIM-002/tests/`. Comando: `node --test "product/SIM-002/tests/**/*.test.js"`.
TEST_RESULTS: Execução em 2026-08-13 (Node.js v24.18.0):
  tests 12 / suites 0 / pass 12 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms 98.5321
  Testes: TC-SIM2-001, TC-SIM2-001b, TC-SIM2-002, TC-SIM2-002b, TC-SIM2-002c, TC-SIM2-002d,
  TC-SIM2-003, TC-SIM2-003b, TC-SIM2-003c, TC-SIM2-004, TC-SIM2-005, TC-SIM2-006 — todos PASS.

KNOWN_LIMITATIONS: Gateway externo simulado em memória (não há integração real, mas a política de aceite/recusa é injetável via `decide`); sem transporte HTTP; não há autenticação de credencial — o chamador informa `user.id`, cujo papel e empresa são resolvidos na tabela `users` (APR-2026-008). O `approver` de `approveSupplier` permanece autodeclarado (fora do escopo da WAVE-D).
KNOWN_RISKS: Nenhum risco registrado pela engenharia neste ciclo.
DEPLOYMENT_PLAN: N/A (biblioteca para o simulado; sem deploy). A base é criada/atualizada na abertura via `schema.sql`.
ROLLBACK_PLAN: N/A (sem deploy; reversão via git).
DOCUMENTATION_INDEX:
  - `product/SIM-002/README.md`
  - `product/SIM-002/requirements/BUSINESS_RULES.md`
  - `product/SIM-002/requirements/REQUIREMENTS.md`
  - `product/SIM-002/requirements/DATA_DICTIONARY.md`
  - `product/SIM-002/docs/API.md`
  - `product/SIM-002/SOFTWARE_RELEASE_PACKAGE.md`

---

DECLARAÇÃO OpusCore: IMPLEMENTATION COMPLETE — release SIM-002-RC1 pronta para auditoria da VeriCore.
