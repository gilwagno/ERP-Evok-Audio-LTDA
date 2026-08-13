# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)

CASE_ID: SIM-002-WAVE-D
FINDING_ID: FIND-SIM-002-004, FIND-SIM-002-008 (divergência A + OBS-002), FIND-SIM-002-009
PROJECT_ID: SIM-002
AUDIT_ID: SIM-002-AUD-001
AUDIT_COMMIT: f2fcf1c78a6a1255738d05e66a6100fa9c47428a  (imutável — não substituído por este pacote)
BRANCH: `sana/SIM-002/WAVE-D`
MERGE_COMMIT (integração A+B+C): `ab6a1b3054175e2d75ad411459d1cacb019e9e30`
REMEDIATION_COMMIT: `b6d44daf1ae9afdadfc4336d9f730691bc2c3630`
DATA: 2026-08-13
AUTOR: sanacore-remediation-engineer
STATUS DOS FINDINGS: permanecem `RETEST_REQUIRED` — SanaCore não fecha finding
(Regras 3 e 4 do `CLAUDE.md`).

FONTE NORMATIVA DAS DECISÕES: `coretriad/governance/APPROVALS.md` —
APR-2026-007, APR-2026-008, APR-2026-009 (human gates, Regra 18). Nenhuma regra
de negócio foi inventada nesta remediação; o que não estava aprovado ficou
registrado como lacuna (ver RESIDUAL_RISK).

---

## PARTE 0 — RESOLUÇÃO DO MERGE DE INTEGRAÇÃO

O worktree recebeu, em sequência, `sana/SIM-002/WAVE-A`, `WAVE-B` e `WAVE-C`. O
merge da WAVE-C conflitou em 3 arquivos. **Nenhum lado foi escolhido**: os dois
conjuntos de correção foram preservados por união.

### O que cada onda trouxe

| Onda | Correção material | Onde está no código integrado |
|---|---|---|
| WAVE-A | Alçada do analista de volta a R$ 10.000 (BR-APR-001) | `src/approvalService.js` (não conflitou) |
| WAVE-B | Isolamento de tenant: `loadSupplierInTenant`, `listPaymentsBySupplier` filtrando por `company_id`, `createSupplier` com sujeito e recusa de `companyId` divergente | `src/paymentService.js`, `src/supplierService.js` |
| WAVE-C | Integridade: `db.transaction()` com `BEGIN IMMEDIATE`, `createPayment` transacional, `sendPayment` idempotente com curto-circuito e `idempotencyKey`, `UNIQUE` global em `suppliers.cnpj` com erro de negócio legível | `src/db.js`, `src/schema.sql`, `src/paymentService.js`, `src/supplierService.js` |

### Conflito 1 — `src/paymentService.js`

As duas ondas reescreveram o mesmo bloco de topo do serviço. Resolução:
mantidos **os dois** — a guarda `db.transaction` e `idempotencyKeyFor` da
WAVE-C **mais** `loadSupplierInTenant` da WAVE-B.

Defeito latente que o conflito escondia e que teria passado num "aceitar um dos
lados": a WAVE-B declarava `loadApprovedSupplier` como `async`, mas a WAVE-C
passou a chamá-la **dentro** de `db.transaction()`, que rejeita bloco
assíncrono. Combinadas ingenuamente, a função devolveria uma `Promise`,
`supplier.status` seria `undefined` (a checagem de fornecedor aprovado nunca
dispararia) e o `INSERT` gravaria `company_id` `undefined` — perda simultânea
das duas correções. Resolvido tornando `loadApprovedSupplier` **síncrona**,
que é o contrato exigido pela transação.

### Conflito 2 — `src/supplierService.js`

A WAVE-B derivava a empresa de `user.companyId`; a WAVE-C inseria dentro de
transação usando o parâmetro `companyId`. Resolução: a transação da WAVE-C
permanece, e a empresa de destino passa a ser `targetCompanyId`, derivado da
identidade — nunca do parâmetro. Preservados o `SELECT` de duplicidade global,
o `try/catch` que converte `SQLITE_CONSTRAINT` em erro de negócio e as guardas
de sujeito da WAVE-B.

### Conflito 3 — `docs/API.md`

Seção `createSupplier`: bullets unidos — entrada/erros/tenant da WAVE-B mais
`CNPJ já cadastrado para outro fornecedor` e a seção **Garantias** da WAVE-C;
referências passam a citar REQ-SIM2-001, BR-SUP-002 **e** BR-SEC-001.

### Prova de que nada se perdeu

1. `git diff sana/SIM-002/WAVE-B` sobre os arquivos conflitados: as únicas
   linhas removidas são as versões **não transacionais** que a WAVE-C
   substituiu (`db.run` solto de `payment_attempts`/`payments`, `UPDATE ... SET
   status='sent'` sem transação). Nenhuma guarda de tenant foi removida.
2. Suíte das três ondas executada junta imediatamente após a resolução:
   **35 testes, 35 pass, 0 fail** — incluindo TC-SIM2-005b/005c (tenant,
   WAVE-B), TC-SIM2-004b..e (idempotência, WAVE-C), TC-SIM2-001c..f (unicidade
   global, WAVE-C) e TC-SIM2-002e..i (alçada, WAVE-A).
3. Único teste ajustado nesta etapa: os casos da WAVE-C passaram a informar
   `user` em `createSupplier`, porque a **assinatura** mudou na WAVE-B. Ajuste
   de chamada, não de expectativa — nenhuma asserção foi relaxada.

Commit da integração: `ab6a1b3`.

---

## PARTE 1 — FIND-SIM-002-004 (`cancelPayment`) · APR-2026-007

ROOT_CAUSE:
Comportamento de negócio implementado sem origem documental (Regras 6 e 17):
`cancelPayment` existia em código sem REQ, AC, BR ou entrada em `docs/API.md`.
Na ausência de norma, a implementação inventou uma máquina de estados própria —
`sent → created`, zerando `sent_at` mas **preservando** `external_ref` — e, por
não ter sujeito, operava sem identidade e sem tenant. A causa sistêmica não é a
linha do `UPDATE`: é operação de escrita publicada sem requisito e sem sujeito.

LOCAL_FIX:
- Removida a transição `sent → created`. Cancelar pagamento já enviado é
  RECUSADO (`Pagamento já enviado não pode ser cancelado; estorno é operação
  distinta`), conforme APR-2026-007 — estorno é operação distinta, fora do
  escopo do SIM-002.
- Somente `created` é cancelável; qualquer outro estado recusa com
  `Somente pagamento em "created" pode ser cancelado`.
- A operação passou a exigir `user` e a resolver o principal no banco;
  pagamento de outra empresa é indistinguível de inexistente
  (`Pagamento não encontrado`) — BR-SEC-001.

SYSTEMIC_FIX_REQUIRED:
- A operação ganhou origem documental: **REQ-SIM2-007 + AC-SIM2-007**
  (`requirements/REQUIREMENTS.md`), **BR-PAY-003**
  (`requirements/BUSINESS_RULES.md`) e seção própria em `docs/API.md`.
- Transições válidas de `payments.status` passaram a ser enumeradas no
  `DATA_DICTIONARY.md`, incluindo a proibição explícita de qualquer saída de
  `sent`.
- Pendente fora do escopo: gate de "nenhuma função exportada sem REQ" na
  auditoria de contrato — recomendação, não implementado aqui.

BLAST_RADIUS:
`payments.cancelPayment` e todo chamador que dependesse da reabertura de
pagamento enviado. Único chamador no repositório: TC-SIM2-004e (WAVE-C), que
usava o cancelamento apenas como cenário intermediário para provar
idempotência — o caso foi reescrito para asserir a RECUSA do cancelamento e
manter a garantia material (reenvio não gera segunda movimentação).

---

## PARTE 2 — FIND-SIM-002-008-A + OBS-002 (papéis) · APR-2026-008

ROOT_CAUSE:
Duas causas encadeadas. (1) Contradição normativa sem árbitro: `docs/API.md`
exigia `manager` em `createPayment`, o código aceitava `analyst`+`manager` e
nenhuma BR decidia — resolvida por decisão humana (APR-2026-008), não por
contagem de artefatos. (2) Causa sistêmica, mais grave: **não existia fonte de
identidade**. `role` e `companyId` chegavam no payload do chamador; o servidor
apenas os lia. Toda a autorização — inclusive o isolamento por empresa
remediado na WAVE-B — repousava sobre dado controlado por quem faz a chamada.
As leituras (`getSupplier`, `listPaymentsBySupplier`) sequer verificavam papel:
declaravam-no no contrato e não o conferiam.

LOCAL_FIX:
- Nova tabela `users` (`id` TEXT PK, `company_id` FK → `companies`, `role` com
  `CHECK IN ('analyst','manager')`, `created_at`) em `src/schema.sql`, com
  índice `idx_users_company`; helper `createUser` em `src/db.js`.
- Novo módulo `src/identity.js`: `resolve(user)` usa **apenas** `user.id` como
  chave e devolve papel e empresa lidos de `users`; `authorize(user, roles,
  msg)` aplica a matriz. `role`/`companyId` do payload são descartados. `id`
  ausente → `Usuário inválido`; `id` inexistente → `Usuário não autenticado`.
- `createPayment` e `sendPayment`: exclusivos de `manager`.
  `getSupplier` e `listPaymentsBySupplier`: `analyst` e `manager`.
  `createSupplier`: qualquer papel reconhecido (nenhuma BR restringe) — e a
  empresa de destino passa a vir de `users.company_id`.
- `sendPayment`, que era anônimo, passou a exigir sujeito `manager` e a operar
  apenas sobre pagamento da própria empresa.
- `docs/API.md` (que já dizia `manager` para `createPayment`) foi mantido como
  correto; **o código é que se alinhou ao contrato**.

SYSTEMIC_FIX_REQUIRED:
- **BR-SEC-002** criada em `requirements/BUSINESS_RULES.md` com a matriz
  aprovada e o princípio "papel e empresa são atributos do servidor", vinculada
  à Regra 24 do `CLAUDE.md`. **REQ-SIM2-008 + AC-SIM2-008** criados.
- A autorização deixou de ser condição espalhada por serviço e passou a ter um
  único ponto de resolução (`identity.js`) — qualquer serviço novo herda o
  padrão chamando `authorize`.
- `users` documentada no `DATA_DICTIONARY.md`; matriz replicada em
  `docs/API.md` e no `SOFTWARE_RELEASE_PACKAGE.md` (que afirmava
  `analyst`+`manager` para criar pagamento e era uma das fontes da divergência).
- **Não corrigido, e deliberadamente:** `approvalService.approveSupplier` ainda
  confia no `approver.role` do payload. APR-2026-008 decidiu sobre pagamentos e
  leituras; estender a decisão à alçada de aprovação seria inventar regra
  (Regra 6). Registrado em RESIDUAL_RISK e sinalizado em `docs/API.md`.

BLAST_RADIUS:
Todos os pontos de entrada de `supplierService` e `paymentService`, mais o
harness de testes: nenhum usuário existe implicitamente — é preciso provisioná-lo
em `users`. `approvalService` não foi alterado.

---

## PARTE 3 — FIND-SIM-002-009 (recusa do gateway) · APR-2026-009

ROOT_CAUSE:
O código reconhecia a possibilidade de recusa (calculava
`accepted ? 'accepted' : 'failed'` para a trilha) mas o `UPDATE` fixava
`status = 'sent'` literal, sem consultar `response.accepted` — a base afirmava
envio bem-sucedido enquanto a trilha afirmava o contrário. Havia ainda uma
lacuna normativa: o domínio de `payments.status` não previa estado de falha; e
uma lacuna de testabilidade: `gatewayClient` sempre devolvia `accepted: true`,
tornando o ramo de recusa inalcançável em teste.

LOCAL_FIX:
- `failed` incorporado ao domínio de `payments.status`, com
  `CHECK (status IN ('created','sent','cancelled','failed'))` no DDL.
- Sob recusa: `UPDATE payments SET status = 'failed'`, sem tocar
  `external_ref`/`sent_at` (não houve envio); a tentativa é gravada com
  `result = 'failed'` e `external_ref` nula. Insert da tentativa e update do
  pagamento permanecem na mesma transação (garantia herdada da WAVE-C).
- Retentativa continua possível: `failed` não curto-circuita, e um envio
  posteriormente aceito leva o pagamento a `sent` preservando a trilha da
  recusa.
- `createGatewayClient({ decide })`: política de aceite/recusa injetável. A
  recusa não consome sequência nem memoiza a chave de idempotência.

SYSTEMIC_FIX_REQUIRED:
- **BR-PAY-004** criada; **AC-SIM2-004b** acrescentado a REQ-SIM2-004.
- `DATA_DICTIONARY.md`: domínio de `payments.status` atualizado e tabela de
  transições válidas adicionada; `sent_at` documentado como nulo sob recusa.
- `docs/API.md`: `sendPayment` passa a documentar saída de aceite **e** de
  recusa, e `createGatewayClient` ganha seção com o parâmetro `decide`.
- O `CHECK` no DDL impede que qualquer caminho futuro grave status fora do
  domínio (defesa em profundidade, coberta por TC-SIM2-009c).

BLAST_RADIUS:
`sendPayment` e consumidores de `payments.status`. O comportamento de aceite —
incluindo a idempotência da WAVE-C — é bit-a-bit o mesmo: a recusa é um ramo
novo, e o gateway sem `decide` continua aceitando como antes.

---

## CORRECTION_STRATEGY

1. Resolver o merge por união verificada (nunca "ours"/"theirs"), rodar a suíte
   das três ondas e só então tocar em comportamento novo — commit separado
   (`ab6a1b3`), para que a VeriCore consiga distinguir integração de remediação.
2. Tratar a causa sistêmica de cada finding, não a linha citada na evidência:
   fonte de identidade em vez de trocar a constante `PAYER_ROLES`; requisito e
   BR para `cancelPayment` em vez de apagar o ramo `sent`; domínio de status em
   vez de um `if` no `UPDATE`.
3. Ancorar cada decisão de negócio num APR nominal e registrar como lacuna tudo
   que a aprovação não cobriu.
4. Testes primeiro no comportamento observável (estado relido do banco), depois
   verificação por mutação de que cada teste de fato morde.

## FILES_CHANGED / FILES_AFFECTED

Código:
- `product/SIM-002/src/identity.js` — **novo**, fonte confiável de identidade.
- `product/SIM-002/src/schema.sql` — tabela `users`, `CHECK` de
  `payments.status`, índice `idx_users_company`.
- `product/SIM-002/src/db.js` — helper `createUser`.
- `product/SIM-002/src/paymentService.js` — matriz de papéis, `cancelPayment`,
  `sendPayment` com sujeito/tenant/`failed`, `loadPaymentInTenant`.
- `product/SIM-002/src/supplierService.js` — identidade resolvida no banco em
  `createSupplier` e `getSupplier`.
- `product/SIM-002/src/gatewayClient.js` — parâmetro `decide`.

Testes:
- `product/SIM-002/tests/remediation-wave-d.test.js` — **novo**, 13 casos.
- `product/SIM-002/tests/support.js` — `buildContext` provisiona usuários reais
  (`ctx.user`) e aceita gateway injetado; `claimedUser` representa payload
  hostil não provisionado.
- `product/SIM-002/tests/payments.test.js`, `approval.test.js`,
  `suppliers.test.js`, `remediation-wave-c.test.js` — adaptados às assinaturas.

Documentação:
- `product/SIM-002/requirements/BUSINESS_RULES.md` — BR-PAY-003, BR-SEC-002,
  BR-PAY-004.
- `product/SIM-002/requirements/REQUIREMENTS.md` — REQ-SIM2-007/AC-SIM2-007,
  REQ-SIM2-008/AC-SIM2-008, AC-SIM2-004b, BRs relacionadas de REQ-SIM2-003/004.
- `product/SIM-002/requirements/DATA_DICTIONARY.md` — tabela `users`, domínio e
  transições de `payments.status`.
- `product/SIM-002/docs/API.md` — seção de identidade e matriz, `cancelPayment`,
  `sendPayment`, `createGatewayClient`, erros de autenticação.
- `product/SIM-002/SOFTWARE_RELEASE_PACKAGE.md` — matriz de autorização, modelo
  de dados, contratos e limitações conhecidas.

## TESTS_ADDED

`tests/remediation-wave-d.test.js`:

| TC | Cobre |
|---|---|
| TC-SIM2-007a | `created → cancelled` |
| TC-SIM2-007b | cancelar `sent` é RECUSADO; status, `external_ref` e `sent_at` intactos |
| TC-SIM2-007c | `cancelPayment` sem sujeito é recusado |
| TC-SIM2-007d | `cancelPayment` cross-tenant é recusado, status permanece `created` |
| TC-SIM2-008a | `analyst` não registra pagamento; `manager` registra |
| TC-SIM2-008b | `analyst` não envia; `manager` envia; gateway não é tocado na recusa |
| TC-SIM2-008c | `sendPayment` sem sujeito é recusado |
| TC-SIM2-008d | `analyst` **e** `manager` leem pagamentos e fornecedores |
| TC-SIM2-008e | id inexistente na fonte de identidade é recusado (leitura e escrita) |
| TC-SIM2-008f | payload `role:'manager'` com `users.role = 'analyst'` → RECUSADO |
| TC-SIM2-008g | `companyId` forjado no payload não dá acesso cross-tenant |
| TC-SIM2-009a | gateway recusa → `status='failed'`, tentativa `failed`, não conta como enviado |
| TC-SIM2-009b | pagamento `failed` reenviado e aceito vira `sent`; trilha preserva a recusa |
| TC-SIM2-009c | banco recusa status fora do domínio (`CHECK`) |

## TESTS_CHANGED

- `tests/support.js`: `user()` deixou de ser fábrica de objeto solto e passou a
  **provisionar** o usuário em `users` (`ctx.user`), com erro explícito se o
  mesmo `id` for pedido em duas empresas/papéis — a tabela é a verdade.
  Adicionado `claimedUser` (payload sem lastro no banco) e injeção de gateway.
- `tests/payments.test.js`: quem registra pagamento passou a ser `manager`
  (APR-2026-008); leituras seguem exercitadas por `analyst`. Asserções e
  fronteiras (teto de crédito, tenant, ordenação) inalteradas.
- `tests/remediation-wave-c.test.js`: `createSupplier` com `user`,
  `sendPayment` com `user` `manager`, e TC-SIM2-004e reescrito — a etapa de
  cancelamento de pagamento `sent` passou a asserir RECUSA, preservando a
  garantia original (reenvio não gera segunda movimentação no gateway).
- `tests/approval.test.js`, `tests/suppliers.test.js`: usuários provisionados.
  Nenhuma asserção relaxada.

## TEST_RESULTS

Comando: `node --test "product/SIM-002/tests/**/*.test.js"` (Node.js v24.18.0)

Após a resolução do merge, antes da Parte 2:

```
ℹ tests 35 / suites 0 / pass 35 / fail 0 / cancelled 0 / skipped 0 / todo 0
```

Após a remediação dos 3 human gates (execução final, commit `b6d44da`):

```
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 268.0573
```

## REGRESSION_ANALYSIS / REGRESSION_RISK

Verificação por mutação — cada correção foi revertida isoladamente no código e
a suíte da WAVE-D reexecutada, para provar que os testes **falham contra o
comportamento anterior** (fonte restaurada em seguida; `git diff` limpo):

| Mutação (comportamento pré-correção) | Testes que quebram |
|---|---|
| `resolve()` devolve papel/empresa do payload | TC-SIM2-008f, TC-SIM2-008g |
| `cancelPayment` volta a fazer `sent → created` | TC-SIM2-007b |
| `sendPayment` grava `sent` incondicionalmente | TC-SIM2-009a, TC-SIM2-009b |
| `createPayment` aceita `analyst` | TC-SIM2-008a, TC-SIM2-008f |

Riscos de regressão avaliados:

- **Alto (mitigado):** toda operação passou a exigir usuário provisionado.
  Chamador que não crie `users` recebe `Usuário não autenticado`. É a mudança
  de contrato pretendida por APR-2026-008, documentada em `docs/API.md` e no
  release package. Impacto real no repositório: apenas o harness de testes.
- **Médio (mitigado):** `cancelPayment` sobre `cancelled`/`failed` agora lança
  em vez de ser silenciosamente idempotente. Coberto por BR-PAY-003 e
  documentado nos erros da API.
- **Baixo:** `createPayment` deixou de aceitar `analyst` — comportamento
  aprovado, não regressão.
- **Nulo esperado:** caminho de aceite do gateway inalterado; idempotência
  (TC-SIM2-004b..e) e teto de crédito sob concorrência (TC-SIM2-003d) seguem
  verdes.

## ARCHITECTURE_IMPACT

Introduzida camada explícita de resolução de identidade/autorização
(`src/identity.js`), consumida pelos serviços de domínio. `approvalService`
ainda não a consome (fora do escopo aprovado). Sem impacto em transporte
(continua sem HTTP) nem em dependências (zero, `node:sqlite` nativo).

## DATABASE_IMPACT

- Nova tabela `users` + índice `idx_users_company`.
- `payments.status` ganhou `CHECK` com 4 valores.
- DDL permanece idempotente (`CREATE TABLE IF NOT EXISTS`). **Atenção da
  VeriCore:** o `CHECK` é aplicado apenas na criação da tabela; base
  pré-existente criada com o schema antigo **não** ganha a constraint por
  reabertura — em produto real exigiria migração. Registrado em RESIDUAL_RISK.

## API_IMPACT

Mudanças de contrato (breaking, aprovadas):
- `payments.sendPayment({ paymentId })` → `({ paymentId, user })`, papel `manager`.
- `payments.cancelPayment({ paymentId })` → `({ paymentId, user })`, apenas `created`.
- `payments.createPayment`: `analyst` deixa de ser aceito.
- `role`/`companyId` do payload deixam de ter qualquer efeito em todos os serviços.
- `sendPayment` pode retornar pagamento em `failed`.

## SECURITY_CHECKS

- Papel autodeclarado eliminado nos serviços em escopo — provado por
  TC-SIM2-008f (papel forjado) e TC-SIM2-008g (empresa forjada), que operam com
  payload hostil (`claimedUser`) sem lastro no banco.
- Tenant isolation estendido a `sendPayment` e `cancelPayment` (BR-SEC-001),
  sempre com erro genérico (`Pagamento não encontrado` / `Fornecedor não
  encontrado`) para não servir de oráculo de existência.
- Segregação de funções melhorada: registrar pagamento agora exige `manager`,
  enquanto a alçada de aprovação até R$ 10.000 permanece com `analyst` — o
  analista deixa de aprovar o crédito **e** consumi-lo (interação citada em
  FIND-SIM-002-008 com FIND-SIM-002-001).
- Sem dependências externas introduzidas; nenhum segredo, credencial ou dado
  pessoal manipulado.

## DOCUMENTATION_UPDATED

`requirements/BUSINESS_RULES.md`, `requirements/REQUIREMENTS.md`,
`requirements/DATA_DICTIONARY.md`, `docs/API.md`,
`SOFTWARE_RELEASE_PACKAGE.md`. Nenhum artefato de `audit/` foi tocado; nenhuma
entrada de `coretriad/governance/APPROVALS.md` foi editada — as decisões foram
apenas transcritas com citação de origem.

## RESIDUAL_RISK

1. **`approvalService` continua com `approver.role` autodeclarado.** É a mesma
   classe de defeito do OBS-002, mas APR-2026-008 não cobriu a alçada de
   aprovação; corrigir por conta própria violaria a Regra 6. Recomenda-se novo
   human gate. Enquanto isso, um chamador que se declare `manager` aprova
   crédito acima da alçada — o dano é limitado porque **registrar** pagamento
   agora exige `manager` real no banco.
2. **Autenticação inexistente.** `users` resolve *autorização*; não há
   credencial, sessão ou verificação de posse do `id`. Adequado ao simulado,
   inaceitável em produto real (Regra 24).
3. **Papel do cancelamento não arbitrado.** Hoje `analyst` e `manager`
   cancelam. Se o negócio quiser restringir a `manager`, exige nova aprovação.
4. **`CHECK` de `payments.status` não retroage** a bases criadas com o schema
   antigo (não há mecanismo de migração no SIM-002).
5. **Recusa do gateway não tem limite de retentativa** — pagamento pode
   alternar `failed → failed` indefinidamente. Nenhuma BR define política de
   retry; não foi inventada.

## RETEST_INSTRUCTIONS

1. `git checkout sana/SIM-002/WAVE-D && git rev-parse HEAD` → deve ser
   `b6d44daf1ae9afdadfc4336d9f730691bc2c3630`.
2. `node --test "product/SIM-002/tests/**/*.test.js"` → esperado 49/49 pass.
3. FIND-004: confirmar que `cancelPayment` não tem ramo `sent → created`
   (`src/paymentService.js`) e que TC-SIM2-007b relê o status do banco.
4. FIND-008: `grep -rn "user\.role\|user\.companyId" product/SIM-002/src` deve
   retornar **vazio** (verificado). O serviço de aprovação usa `approver.role`
   — outra variável, fora de escopo: ver RESIDUAL_RISK 1.
   `grep -rn "approver\.role" product/SIM-002/src` localiza a pendência.
5. FIND-009: confirmar `status='failed'` e `payment_attempts.result='failed'`
   sob `createGatewayClient({ decide: () => false })`.
6. Reproduzir a verificação por mutação da seção REGRESSION_ANALYSIS se quiser
   evidência independente de que os testes mordem.

---

DECLARAÇÃO SanaCore: **REMEDIATION_COMPLETE**.

Os findings FIND-SIM-002-004, FIND-SIM-002-008 (divergência A + OBS-002) e
FIND-SIM-002-009 permanecem `RETEST_REQUIRED`. `RETEST_PASSED` e
`FINDING CLOSED` são atos exclusivos da VeriCore (Regras 3 e 4 do `CLAUDE.md`).
