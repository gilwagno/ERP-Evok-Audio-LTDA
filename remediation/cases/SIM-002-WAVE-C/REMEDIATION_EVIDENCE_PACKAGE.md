# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)

CASE_ID: SIM-002-WAVE-C
FINDING_ID: FIND-SIM-002-003 (CRITICAL), FIND-SIM-002-005 (HIGH), FIND-SIM-002-006 (HIGH)
AUDIT_ID: SIM-002-AUD-001
AUDIT_COMMIT: f2fcf1c78a6a1255738d05e66a6100fa9c47428a
PROJECT_ID: SIM-002
BRANCH: sana/SIM-002/WAVE-C
STATUS: REMEDIATION_COMPLETE — findings permanecem RETEST_REQUIRED

---

## 0. REPRODUÇÃO PRÉVIA (contra o código auditado)

Os testes de regressão foram escritos **antes** da correção e executados contra o
código do `AUDIT_COMMIT`. Resultado: 7 de 9 falharam, reproduzindo os três
findings; os 2 que passaram são os controles de não-regressão (CNPJs distintos
aceitos; teto sequencial).

```
✖ TC-SIM2-004b  reenvio produz 2ª movimentação no gateway   (FIND-003)
✖ TC-SIM2-004c  gateway não deduplica por chave             (FIND-003)
✖ TC-SIM2-004d  banco não impede 2ª tentativa aceita        (FIND-003)
✖ TC-SIM2-001c  CNPJ duplicado na mesma empresa é aceito    (FIND-005)
✖ TC-SIM2-001d  CNPJ duplicado em outra empresa é aceito    (FIND-005)
✖ TC-SIM2-001e  banco não impõe unicidade de CNPJ           (FIND-005)
✖ TC-SIM2-003d  2 × 8000 concorrentes com limite 10000 → SUM = 16000 (FIND-006)
✔ TC-SIM2-001f  não-regressão (CNPJs distintos)
✔ TC-SIM2-003e  não-regressão (teto sequencial)
```

---

## 1. FIND-SIM-002-003 — sendPayment sem idempotência (CRITICAL)

ROOT_CAUSE:
Causa sistêmica em três camadas simultâneas, não uma linha isolada:
(a) **estado** — a única guarda de `sendPayment` era `status === 'cancelled'`;
não havia teste de `status === 'sent'` nem leitura de `external_ref` antes da
chamada externa; (b) **contrato de integração** — `submitPayment` não aceitava
chave de idempotência e incrementava `sequence` incondicionalmente, de modo que
o gateway não tinha como reconhecer uma retentativa; (c) **dado** — nenhuma
constraint em `payment_attempts` limitava tentativas aceitas por pagamento, e o
`UPDATE` gravava `external_ref` sem condição, destruindo a referência canônica do
primeiro envio. A operação era não idempotente em todas as camadas ao mesmo tempo.

LOCAL_FIX:
- `paymentService.sendPayment`: curto-circuito **antes** do gateway quando
  `status === 'sent' && external_ref` — devolve o registro persistido (mesma
  `external_ref`, mesmo `sent_at`), sem chamada externa e sem escrita.
- Chave de idempotência estável `SIM2-PAY-<paymentId>`, derivada apenas da
  identidade do pagamento, propagada em `submitPayment({ ..., idempotencyKey })`.
- `UPDATE` passa a usar `COALESCE(external_ref, ?)` e `COALESCE(sent_at, ?)`:
  referência e instante do primeiro envio nunca são sobrescritos.
- `INSERT` da tentativa é precedido, na mesma transação, de verificação de
  tentativa `accepted` preexistente — sem duplicar a trilha e sem colidir com a
  nova constraint.

SYSTEMIC_FIX_REQUIRED:
- `gatewayClient.submitPayment` passou a deduplicar por `idempotencyKey`
  (`Map` chave → `externalRef`): mesma chave devolve a mesma `externalRef`,
  **sem** incrementar `sequence` e **sem** registrar nova entrada em `calls`
  (portanto sem movimentação). Fallback determinístico `payment:<paymentId>`
  quando a chave não é informada. `reset()` limpa o mapa.
- Defesa em profundidade no banco: índice único parcial
  `uq_payment_attempts_accepted ON payment_attempts (payment_id) WHERE result = 'accepted'`.
  Tentativas `failed` permanecem irrestritas para preservar a trilha.
- A demarcação transacional (item 3) cobre também o par INSERT+UPDATE deste fluxo.

BLAST_RADIUS:
`sendPayment` (único produtor de `payments.external_ref`/`sent_at` e de linhas em
`payment_attempts`) e todos os consumidores do cliente de gateway. Contrato de
`submitPayment` estendido de forma **retrocompatível** (parâmetro opcional; o
retorno ganha `deduplicated`, campo aditivo). Chamadores atuais: apenas testes.
Interação com FIND-SIM-002-004 (cancelPayment) coberta por TC-SIM2-004e.
Fora do escopo, deliberadamente: FIND-SIM-002-009 (`status = 'sent'` mesmo com
`accepted === false`) e a ausência de `user`/autorização em `sendPayment` — o
comportamento pré-existente foi preservado para não invadir outro finding.

REGRESSION_RISK: **MÉDIO**.
Consumidor que dependesse de `sendPayment` gerar nova `external_ref` a cada
chamada passa a receber a mesma — que é exatamente o comportamento exigido por
BR-PAY-002. TC-SIM2-004 (caminho feliz de primeiro envio) permanece verde sem
alteração.

---

## 2. FIND-SIM-002-005 — BR-SUP-002 sem implementação (HIGH)

ROOT_CAUSE:
A constraint foi especificada no `DATA_DICTIONARY.md:26` (`UNIQUE`) e **nunca
transposta para o DDL**; nenhuma verificação de duplicidade foi escrita na
aplicação; nenhum teste negativo cobria a 2ª sentença de AC-SIM2-001. A regra
existia apenas como texto — em nenhuma camada executável.

LOCAL_FIX:
`supplierService.createSupplier` verifica duplicidade **global** (`SELECT ... WHERE
cnpj = ?`, sem filtro por `company_id`, conforme a semântica "independentemente da
empresa") e lança o erro de negócio determinístico
`CNPJ já cadastrado para outro fornecedor`. Verificação de empresa, verificação de
duplicidade e `INSERT` executam na mesma transação `BEGIN IMMEDIATE`, evitando que
a corrida entre duas criações do mesmo CNPJ transforme a regra em erro técnico.

SYSTEMIC_FIX_REQUIRED:
- DDL: `suppliers.cnpj TEXT NOT NULL UNIQUE` — a autoridade final passa a ser o
  banco, protegendo também caminhos de escrita futuros e cargas diretas.
- O `INSERT` é envolvido por `try/catch` que reconhece a violação
  (`SQLITE_CONSTRAINT*` / mensagem com `suppliers.cnpj`) e a converte no mesmo
  erro de negócio: **nenhum `SQLITE_CONSTRAINT` cru vaza para o chamador**.
- Divergência documento × DDL eliminada: o dicionário já declarava `UNIQUE`; agora
  o DDL o implementa.

BLAST_RADIUS:
Tabela `suppliers` (todos os caminhos de escrita), `createSupplier` e qualquer
fixture de teste que reutilizasse o mesmo CNPJ. Auditoria de fixtures executada:
nenhum teste pré-existente reaproveita CNPJ dentro do mesmo contexto — a suíte
original permaneceu intacta, sem relaxamento de constraint.

REGRESSION_RISK: **MÉDIO-ALTO em base existente** (ver RESIDUAL_RISK: bases já
populadas com CNPJ duplicado exigem saneamento antes da migração). Nulo na base
recriada a cada execução (`:memory:`).

---

## 3. FIND-SIM-002-006 — teto de crédito sem transação / TOCTOU (HIGH)

ROOT_CAUSE:
A invariante financeira BR-PAY-001 ("em nenhum momento") foi implementada como
read-modify-write na aplicação, sobre um handle de banco que **não expunha
primitiva transacional** (`run/get/all/close/raw`). Como `createPayment` é `async`
e havia `await` entre leitura e escrita, a continuação era diferida para a fila de
microtarefas — e duas execuções concorrentes liam o mesmo `committed` e ambas
inseriam. A causa sistêmica é a lacuna da camada de acesso, não a linha do `if`.

LOCAL_FIX:
`createPayment` passa a executar `carregar fornecedor → somar comprometido →
validar teto → INSERT` dentro de um único bloco `db.transaction(...)`,
integralmente **síncrono** (os helpers `loadApprovedSupplier` e
`sumCommittedAmount` deixaram de ser `async`; a assinatura pública permanece
`async`). Sem `await` dentro do bloco, não há ponto de suspensão entre a leitura e
a escrita: a janela TOCTOU deixa de existir. Idem para o par INSERT+UPDATE de
`sendPayment`, antes duas escritas soltas.

SYSTEMIC_FIX_REQUIRED:
- `db.js` passa a expor `transaction(fn)`: `BEGIN IMMEDIATE` → `fn()` → `COMMIT`,
  com `ROLLBACK` em qualquer erro (inclusive falha do `COMMIT`) e devolução do
  valor de `fn`. Guardas explícitas: função assíncrona é rejeitada com `TypeError`
  (após `ROLLBACK`), impedindo que uma futura evolução reintroduza a suspensão
  dentro do bloco crítico; transação aninhada é rejeitada.
- `createPaymentService` e `createSupplierService` passam a **exigir** handle com
  `transaction()`, falhando na construção — não em produção — se a primitiva
  faltar.

BLAST_RADIUS:
Camada de acesso a dados de todo o SIM-002 (primitiva nova, aditiva, sem alteração
de `run/get/all/close/raw`), `createPayment`, `sendPayment` e `createSupplier`.
`approvalService` não foi tocado: `approveSupplier` é síncrona (FIND-SIM-002-010
concluiu não haver corrida intraprocesso) e está fora deste blast radius.

REGRESSION_RISK: **MÉDIO**.
Serialização de escritas concorrentes sobre o mesmo fornecedor é o efeito
pretendido. Risco novo introduzido e controlado: qualquer bloco passado a
`transaction()` deve ser síncrono — condição verificada em runtime e documentada.

---

## 4. FILES_AFFECTED / FILES_CHANGED

| Arquivo | Natureza | Findings |
|---|---|---|
| `product/SIM-002/src/db.js` | primitiva `transaction(fn)` (BEGIN IMMEDIATE/COMMIT/ROLLBACK) | 006 |
| `product/SIM-002/src/paymentService.js` | curto-circuito de idempotência, chave estável, COALESCE, transações | 003, 006 |
| `product/SIM-002/src/gatewayClient.js` | deduplicação por `idempotencyKey` | 003 |
| `product/SIM-002/src/supplierService.js` | verificação global de CNPJ + conversão da violação em erro de negócio | 005 |
| `product/SIM-002/src/schema.sql` | `suppliers.cnpj UNIQUE`; índice único parcial `uq_payment_attempts_accepted` | 003, 005 |
| `product/SIM-002/tests/remediation-wave-c.test.js` | **novo** — 10 testes de regressão | 003, 005, 006 |
| `product/SIM-002/docs/API.md` | contrato de idempotência, erro de CNPJ duplicado, garantias transacionais, `transaction()` no handle | 003, 005, 006 |
| `product/SIM-002/requirements/DATA_DICTIONARY.md` | índices/constraints de `payment_attempts` | 003 |

TESTS_ADDED (`product/SIM-002/tests/remediation-wave-c.test.js`):
- TC-SIM2-004b — dois `sendPayment` no mesmo pagamento: `callsFor(id).length === 1`,
  mesma `external_ref`, **1** linha em `payment_attempts`, `sent_at` inalterado.
- TC-SIM2-004c — gateway deduplica por chave: mesma chave → mesma `externalRef` e
  uma única chamada; chave distinta → referência distinta.
- TC-SIM2-004d — prova de camada de dados: `INSERT` direto de segunda tentativa
  `accepted` é rejeitado pelo banco.
- TC-SIM2-004e — encadeamento com FIND-SIM-002-004: enviar → cancelar → enviar não
  produz segunda movimentação.
- TC-SIM2-001c — CNPJ duplicado na **mesma** empresa recusado; `COUNT(*) = 1`.
- TC-SIM2-001d — CNPJ duplicado em **empresa diferente** recusado (distingue
  unicidade global de composta `(company_id, cnpj)`); `COUNT(*) = 1`.
- TC-SIM2-001e — prova de camada de dados: `INSERT` direto pelo handle, contornando
  o serviço, é rejeitado pela constraint.
- TC-SIM2-001f — não-regressão: CNPJs distintos continuam aceitos.
- TC-SIM2-003d — concorrência: `Promise.allSettled` de 2 × 8000 com limite 10000 →
  exatamente **1 sucesso** e 1 rejeição por limite; `SUM(amount) <= credit_limit`.
- TC-SIM2-003e — não-regressão sequencial: 6000 + 3000 aceitos, 5000 recusado,
  `SUM = 9000`.

TESTS_CHANGED: **nenhum**. Nenhum teste pré-existente precisou de ajuste de
fixture e nenhuma constraint foi relaxada.

TEST_RESULTS:
```
$ node --test "product/SIM-002/tests/**/*.test.js"
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ cancelled 0  ℹ skipped 0  ℹ todo 0
```
Suíte completa (12 testes pré-existentes + 10 novos): **22/22 verdes**.

REGRESSION_ANALYSIS:
Toda a suíte original (`approval.test.js`, `payments.test.js`, `suppliers.test.js`)
passa sem modificação, incluindo TC-SIM2-004, que continua verde com a nova lógica
de primeiro envio. Os 7 testes que falhavam contra o `AUDIT_COMMIT` passam. Os 2
testes de não-regressão passavam antes e continuam passando, evidenciando que a
correção não inverteu comportamento legítimo.

---

## 5. IMPACTOS

ARCHITECTURE_IMPACT:
Camada de acesso a dados ganha responsabilidade transacional explícita
(`transaction(fn)`), com contrato de sincronicidade verificado em runtime. Serviços
de negócio passam a declarar essa dependência na construção. O contrato de
integração externa passa a ser idempotente por chave — mudança de contrato, ainda
que retrocompatível na assinatura.

DATABASE_IMPACT:
DDL alterado: `suppliers.cnpj` ganha `UNIQUE`; novo índice único parcial
`uq_payment_attempts_accepted`. `schema.sql` usa `CREATE TABLE IF NOT EXISTS`,
portanto **bases já existentes não recebem a constraint de coluna** por
reexecução do schema — ver RESIDUAL_RISK. Transações passam a usar
`BEGIN IMMEDIATE` (bloqueio de escrita antecipado).

API_IMPACT:
- `submitPayment` aceita `idempotencyKey` (opcional) e devolve `deduplicated`
  (aditivo). Sem quebra de assinatura.
- `createSupplier` passa a poder lançar `CNPJ já cadastrado para outro fornecedor`.
- `sendPayment` passa a ser idempotente — semântica documentada em `docs/API.md`.
- `createPaymentService`/`createSupplierService` lançam `TypeError` se receberem
  handle sem `transaction()`.

SECURITY_CHECKS:
Não há dependências de terceiros neste módulo (apenas `node:`), portanto não se
aplica varredura de dependências. Verificações executadas: (a) nenhum SQL montado
por concatenação foi introduzido — todos os statements novos são parametrizados;
(b) nenhum dado sensível passou a ser logado; (c) mensagem de erro de CNPJ
duplicado não revela a empresa proprietária do cadastro conflitante, preservando
BR-SEC-001 (isolamento entre tenants) ao aplicar uma regra global; (d) erro técnico
do banco deixa de vazar para o chamador. Os vetores de segurança residuais
(`sendPayment` sem `user`/autorização) pertencem a findings de outra onda e foram
deliberadamente **não** alterados.

DOCUMENTATION_UPDATED:
- `product/SIM-002/docs/API.md` — seção do handle de banco (`transaction`),
  contrato de idempotência de `sendPayment`, garantias transacionais de
  `createPayment`, erro e garantias de `createSupplier`.
- `product/SIM-002/requirements/DATA_DICTIONARY.md` — índices/constraints de
  `payment_attempts`.
- `BUSINESS_RULES.md` e `REQUIREMENTS.md` **não** foram alterados: BR-SUP-002,
  BR-PAY-001 e BR-PAY-002 já expressavam corretamente a regra; o defeito era de
  implementação, não de especificação. SanaCore não inventa nem reescreve regra de
  negócio.

---

COMMIT_HASH: 9ce475465255743f606a6e390e1c4bf2b673d2fc   # REMEDIATION_COMMIT — não substitui o AUDIT_COMMIT
                                                       # (este pacote de evidência é commitado logo em seguida,
                                                       #  no mesmo branch; o objeto a retestar é o hash acima)
BRANCH: sana/SIM-002/WAVE-C

RESIDUAL_RISK:
1. **Migração de base existente** — `CREATE TABLE IF NOT EXISTS` não aplica
   `UNIQUE` a tabelas já criadas. Base já populada exige script de migração
   (`CREATE UNIQUE INDEX` sobre `suppliers.cnpj` ou recriação de tabela) precedido
   de saneamento de duplicatas preexistentes. Não há base persistente neste
   simulado (`:memory:`), portanto o script não foi escrito — risco registrado e
   **não** mitigado.
2. **Idempotência do gateway é em memória** — o `Map` de chaves vive no processo do
   cliente simulado; um gateway real deve deduplicar do lado servidor. A garantia
   independente de processo, no escopo atual, vem do curto-circuito de estado e do
   índice único parcial em `payment_attempts`.
3. **`BEGIN IMMEDIATE` entre processos** — com arquivo `.db` compartilhado, a
   contenção pode gerar `SQLITE_BUSY`; não há política de retry/`busy_timeout`
   configurada.
4. **Fora de escopo, permanece aberto** — FIND-SIM-002-004 (cancelPayment devolve
   pagamento `sent` a `created`), FIND-SIM-002-009 (`status = 'sent'` mesmo com
   `accepted === false`) e a ausência de autorização/tenant em `sendPayment`.
5. **`payments.external_ref` sem UNIQUE** — a referência externa ainda pode repetir
   entre pagamentos distintos; não pertence aos findings desta onda.

RETEST_INSTRUCTIONS:
1. `cd product/SIM-002 && node --test "tests/**/*.test.js"` — esperado 22/22.
2. FIND-003: executar TC-SIM2-004b, 004c, 004d, 004e. Verificar independentemente
   que `sendPayment` repetido não incrementa `gateway.callCount()` e que
   `payments.external_ref` do 2º retorno é idêntica à do 1º.
3. FIND-005: executar TC-SIM2-001c, 001d, 001e, 001f. Confirmar a constraint no DDL
   (`suppliers.cnpj TEXT NOT NULL UNIQUE`) e que a rejeição ocorre também por
   `INSERT` direto no handle, contornando o serviço.
4. FIND-006: executar TC-SIM2-003d e 003e; conferir a demarcação transacional
   efetiva em `db.js` (`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`) e que o bloco crítico
   de `createPayment` não contém `await`.
5. Reproduzir os passos de REPRODUCTION dos três findings contra o
   REMEDIATION_COMMIT e confirmar que nenhum reproduz.

DECLARAÇÃO: **REMEDIATION_COMPLETE**. Os findings FIND-SIM-002-003, -005 e -006
permanecem em `RETEST_REQUIRED`. SanaCore não declara `RETEST_PASSED` nem
`FINDING CLOSED` — competência exclusiva da VeriCore (CLAUDE.md, Regras 3 e 4).
