# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)
CASE_ID: SIM-002-WAVE-B
FINDING_ID: FIND-SIM-002-002 (CRITICAL), FIND-SIM-002-011 (MEDIUM)
PROJECT_ID: SIM-002
AUDIT_ID: SIM-002-AUD-001
AUDIT_COMMIT: f2fcf1c78a6a1255738d05e66a6100fa9c47428a
STATUS: REMEDIATION_COMPLETE — RETEST_REQUIRED (somente a VeriCore reatesta e fecha)

---

## REPRODUÇÃO PRÉVIA (contra o código anterior à correção)

Script executado no worktree antes da alteração, com as duas empresas do
contexto padrão (A = ACME, B = Globex):

```
FIND-002 REPRO: VAZAMENTO — 2 pagamentos da empresa A entregues a B
FIND-011 REPRO: fornecedor criado em empresa alheia, company_id = 2 (user era da 1)
suppliers em B: 1
```

Após a correção, o mesmo script:

```
FIND-002: recusado -> Fornecedor não encontrado
FIND-011: recusado -> Cadastro de fornecedor em outra empresa não é permitido
suppliers em B: 0
```

Ambos os findings deixaram de reproduzir. A declaração de fechamento não é minha.

---

## ROOT_CAUSE

**FIND-SIM-002-002** — A causa não é "faltou um `AND company_id = ?`". É que o
`paymentService` tinha **dois caminhos de resolução de fornecedor**: um correto
(`loadApprovedSupplier`, que amarra o fornecedor ao tenant do usuário) e um
inexistente — `listPaymentsBySupplier` não resolvia fornecedor algum, ia direto à
tabela `payments` por `supplier_id`. A validação de `user.companyId` em `:111` era
uma guarda de forma (o campo é inteiro?) e não de autorização, e essa aparência de
controle é o que fez a omissão sobreviver à revisão. O tenant era verificado
sintaticamente e descartado semanticamente, exatamente como o finding descreve.

**FIND-SIM-002-011** — `createSupplier` foi desenhada sem sujeito: a empresa de
destino era **dado de entrada** e não **contexto de autenticação**. A validação
existente sobre `companyId` respondia "essa empresa existe?" quando a pergunta de
BR-SEC-001 é "essa empresa é a do chamador?". Verificação de existência ocupando o
lugar de verificação de pertinência.

Causa comum aos dois: **o tenant era tratado como parâmetro, não como contexto** —
em um caso descartado na leitura, no outro escolhido livremente pelo chamador na
escrita.

## LOCAL_FIX

`product/SIM-002/src/paymentService.js`
- Extraído `loadSupplierInTenant(supplierId, user)` — ponto único de resolução de
  fornecedor no serviço, com o predicado `id = ? AND company_id = ?` e erro
  genérico `Fornecedor não encontrado`.
- `loadApprovedSupplier` passou a usá-lo (mesmo comportamento, sem duplicação do
  predicado).
- `listPaymentsBySupplier` agora (a) resolve o fornecedor dentro do tenant e (b)
  filtra `payments` por `supplier_id AND company_id`. Defesa em duas camadas:
  mesmo que um fornecedor viesse a existir fora do tenant, nenhum pagamento de
  outra empresa atravessaria o `WHERE`.
- Erro genérico deliberado: recusa cross-tenant é indistinguível de fornecedor
  inexistente, para não criar oráculo de existência por enumeração de IDs
  sequenciais (agravante registrado no finding).

`product/SIM-002/src/supplierService.js`
- `createSupplier({ cnpj, name, companyId, user })`: `user` obrigatório
  (`Usuário inválido` sem sujeito); `companyId` aceito apenas como redundância
  explícita e recusado quando diverge (`Cadastro de fornecedor em outra empresa
  não é permitido`); o `INSERT` grava `user.companyId`, nunca o parâmetro.
- A checagem de existência da empresa foi mantida, mas agora incide sobre
  `user.companyId`.

## SYSTEMIC_FIX_REQUIRED

**SIM — parcialmente fora deste escopo, e registro explicitamente.**

O padrão de defeito ("operação sem sujeito" / "tenant não imposto") **não está
esgotado** com estes dois findings. Superfície afetada verificada por leitura de
`paymentService.js` completo:

| Operação | Recebe `user`? | Impõe tenant? | Situação |
|---|---|---|---|
| `createSupplier` | agora sim | sim | corrigido nesta onda |
| `getSupplier` | sim | sim | já correto |
| `approveSupplier` | sim (`approver`) | sim | já correto |
| `createPayment` | sim | sim | já correto |
| `listPaymentsBySupplier` | sim | agora sim | corrigido nesta onda |
| **`sendPayment({ paymentId })`** | **não** | **não** | **superfície aberta** |
| **`cancelPayment({ paymentId })`** | **não** | **não** | **superfície aberta** (FIND-SIM-002-004) |

`sendPayment` (`paymentService.js:84-117`) e `cancelPayment` (`:143-157`) carregam
o pagamento por `id` puro (`SELECT * FROM payments WHERE id = ?`), sem sujeito e
sem `company_id`. São **escritas** — enviam dinheiro ao gateway e revertem status —
disponíveis para qualquer `paymentId` enumerável. `cancelPayment` já é objeto de
FIND-SIM-002-004; `sendPayment` fica aqui **registrado como superfície afetada
pelo mesmo padrão sistêmico**, para decisão da VeriCore/Director sobre finding
próprio ou onda subsequente. **Não os alterei**: estão fora do escopo desta onda e
não vou aproveitar a remediação para mexer em comportamento não auditado.

Recomendações sistêmicas remanescentes (não implementadas aqui):
1. Levar `sendPayment`/`cancelPayment` ao mesmo contrato com sujeito.
2. Defesa em profundidade no banco (FK composta / amarração de tenant) —
   FIND-SIM-002-012. Não substitui os predicados de aplicação.
3. Coluna `created_by` em `suppliers` para autoria da escrita (hoje inexistente,
   `schema.sql:9-20`) — FIND-SIM-002-012.

## BLAST_RADIUS

- **Contrato quebrado (breaking change):** `createSupplier` agora exige `user`.
  Todos os chamadores foram localizados por varredura no repositório: os três
  arquivos de teste e os exemplos de `README.md` e `docs/API.md`. **Não existe
  chamador de produção** — o módulo não tem transporte HTTP nem consumidor externo
  (`SOFTWARE_RELEASE_PACKAGE.md:16`, `:36`). Todos foram atualizados.
- `listPaymentsBySupplier` mudou de "sempre retorna array" para "pode lançar
  `Fornecedor não encontrado`". Único chamador: `tests/payments.test.js`.
- `loadApprovedSupplier` foi refatorado para delegar o predicado; comportamento
  observável idêntico (mesmo erro, mesma ordem de checagens: tenant antes de
  status). Coberto por TC-SIM2-003c, que segue verde.
- Não houve alteração de schema, de dados persistidos, nem do gateway.

## CORRECTION_STRATEGY

Alinhar o código ao controle que o próprio produto já exerce em três das quatro
leituras, em vez de inventar mecanismo novo: reaproveitei literalmente o padrão de
`loadApprovedSupplier` / `supplierService.js:49-53` / `approvalService.js:24-28`.
Nenhuma regra de negócio foi criada — BR-SEC-001, AC-SIM2-001 e AC-SIM2-005 já
exigiam este comportamento; a doc já dizia "usuário autenticado da empresa". A
correção move o código até a doc, não o contrário.

## FILES_CHANGED

| Arquivo | Natureza |
|---|---|
| `product/SIM-002/src/paymentService.js` | correção FIND-002 + ponto único de tenant |
| `product/SIM-002/src/supplierService.js` | correção FIND-011 (assinatura com sujeito) |
| `product/SIM-002/tests/suppliers.test.js` | 3 testes novos + assinatura |
| `product/SIM-002/tests/payments.test.js` | 2 testes novos + assinatura + invariante |
| `product/SIM-002/tests/approval.test.js` | assinatura do helper |
| `product/SIM-002/docs/API.md` | contrato de `createSupplier` e `listPaymentsBySupplier` |
| `product/SIM-002/requirements/REQUIREMENTS.md` | REQ/AC-SIM2-001 e AC-SIM2-005 |
| `product/SIM-002/README.md` | exemplo de uso com sujeito |

`tests/support.js` não precisou de alteração: o helper `user()` já servia.

## TESTS_ADDED

| TC | Arquivo | O que prova | Falha no AUDIT_COMMIT? |
|---|---|---|---|
| TC-SIM2-005b | `tests/payments.test.js` | usuário da empresa B listando pagamentos de fornecedor da empresa A → recusa, nenhum dado | **SIM** |
| TC-SIM2-005c | `tests/payments.test.js` | cada empresa vê só os seus; invariante `item.company_id === user.companyId` | não (não discrimina isoladamente; é o positivo/invariante exigido pelo RETEST_SPEC) |
| TC-SIM2-001c | `tests/suppliers.test.js` | `user` de A gravando em B → recusa + `COUNT(*) WHERE company_id = B` permanece 0 | **SIM** |
| TC-SIM2-001d | `tests/suppliers.test.js` | chamada sem `user` → recusa, nenhuma escrita | **SIM** |
| TC-SIM2-001e | `tests/suppliers.test.js` | persistido com `company_id === user.companyId` | **SIM** |

Verificação do teste-do-teste (executada): com `git stash` aplicado apenas sobre
`product/SIM-002/src`, mantendo os testes novos, a suíte deu **13 pass / 4 fail**,
falhando exatamente TC-SIM2-005b, TC-SIM2-001c, TC-SIM2-001d e TC-SIM2-001e. Os
testes novos não são tautológicos.

## TESTS_CHANGED

- TC-SIM2-005: acrescentada asserção de invariante `company_id` em todos os itens.
- TC-SIM2-001, TC-SIM2-001b, TC-SIM2-006, helper `approvedSupplier`
  (payments) e `newSupplier` (approval): adaptados à nova assinatura. Semântica e
  asserções originais preservadas — nenhuma asserção foi enfraquecida ou removida.
- `approvedSupplier` ganhou parâmetro `companyId` (default ACME) para permitir o
  cenário multi-tenant de TC-SIM2-005c.

## TEST_RESULTS

```
$ node --test "product/SIM-002/tests/**/*.test.js"
ℹ tests 17
ℹ suites 0
ℹ pass 17
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

17/17 verdes (12 pré-existentes + 5 novos). Suíte completa do produto.

## REGRESSION_ANALYSIS

- **Risco: BAIXO-MÉDIO.** O único risco real é a quebra de assinatura de
  `createSupplier`, mitigado pela ausência de chamadores fora de testes e docs
  (varredura registrada em BLAST_RADIUS).
- Todos os 12 testes pré-existentes seguem verdes sem afrouxamento.
- `loadApprovedSupplier` mudou de forma, não de comportamento: mesma consulta,
  mesmo erro, mesma precedência tenant→status.
- `sumCommittedAmount` **não** foi alterada. Observo que ela também soma por
  `supplier_id` puro, mas o `supplierId` já chega validado no tenant por
  `loadApprovedSupplier`; não há caminho de chamada que a alcance sem essa
  validação prévia. Registro para a VeriCore, sem alterar.
- Nenhuma migração de dados; bases existentes continuam legíveis.

## ARCHITECTURE_IMPACT

Nenhuma mudança estrutural. Consolidação de um ponto único de imposição de tenant
dentro do `paymentService`. Não foi criada camada, ADR nova ou dependência.

## DATABASE_IMPACT

Nenhum. `schema.sql` intocado, sem migração. Os predicados usam colunas já
existentes e populadas (`payments.company_id`, `suppliers.company_id`).

## API_IMPACT

**Breaking change controlado** em `suppliers.createSupplier` — `user` passa a ser
obrigatório. `payments.listPaymentsBySupplier` passa a poder lançar
`Fornecedor não encontrado`. Ambos documentados em `docs/API.md`.

## SECURITY_CHECKS

- Vazamento cross-tenant de pagamentos: não reproduz (script + TC-SIM2-005b).
- Escrita cross-tenant de fornecedor: não reproduz (script + TC-SIM2-001c, com
  verificação de que a tabela da empresa alheia permaneceu vazia).
- Oráculo de existência: evitado por erro genérico idêntico ao de fornecedor
  inexistente.
- Escrita sem sujeito em `createSupplier`: bloqueada (TC-SIM2-001d).
- Escrita sem sujeito em `sendPayment`/`cancelPayment`: **permanece aberta** — ver
  SYSTEMIC_FIX_REQUIRED.

## DOCUMENTATION_UPDATED

- `docs/API.md` — assinatura, entrada, saída e erros de `createSupplier`;
  saída/erros de `listPaymentsBySupplier`; referência BR-SEC-001 acrescida.
- `requirements/REQUIREMENTS.md` — REQ-SIM2-001 e AC-SIM2-001 reescritos com
  sujeito e derivação da empresa; AC-SIM2-005 explicitando erro genérico e
  invariante; TCs planejados atualizados.
- `README.md` — exemplo de uso rápido com usuário autenticado.

`SOFTWARE_RELEASE_PACKAGE.md` não foi alterado: é artefato de release da OpusCore
e sua afirmação `:25` ("Cadastrar fornecedor: usuário da empresa — permitido")
passou a ser verdadeira com a correção.

## COMMIT_HASH

REMEDIATION_COMMIT: `9f7b056b96c553699c5cf60597995debe5495500`
(não substitui o AUDIT_COMMIT `f2fcf1c78a6a1255738d05e66a6100fa9c47428a`)

## BRANCH

`sana/SIM-002/WAVE-B` — worktree `C:/Gilwagno WorkSpace/ERP-Evok-sana-B`

## RESIDUAL_RISK

1. **`sendPayment` e `cancelPayment` sem sujeito nem tenant** — risco residual
   material, deliberadamente não tocado nesta onda. `cancelPayment` = FIND-SIM-002-004;
   `sendPayment` sem finding próprio até onde vejo.
2. **Sem defesa em profundidade no banco** — a imposição de tenant é 100%
   aplicacional (FIND-SIM-002-012).
3. **Sem autoria da escrita** — `suppliers` continua sem `created_by`; sabe-se que
   o cadastro é da empresa certa, não quem o fez.
4. **Sem unicidade de CNPJ** (FIND-SIM-002-005) — inalterado.
5. O modelo de confiança do produto segue "o chamador informa `user`"
   (`SOFTWARE_RELEASE_PACKAGE.md:36`): a correção impõe o tenant declarado, não
   autentica a declaração.

## RETEST_INSTRUCTIONS

1. `cd` no worktree/commit `9f7b056` e rodar
   `node --test "product/SIM-002/tests/**/*.test.js"` → esperado 17/17.
2. Confirmar independentemente que TC-SIM2-005b, TC-SIM2-001c/d/e falham no
   AUDIT_COMMIT (`git stash` de `product/SIM-002/src` reproduz o cenário).
3. Executar a REPRODUCTION do FIND-SIM-002-002 (passos 1-4) e do FIND-SIM-002-011
   (passos 1-3) e verificar recusa em ambos.
4. Verificar a invariante universal do RETEST_SPECIFICATION de FIND-002: para toda
   listagem bem-sucedida, `item.company_id === user.companyId`.
5. Verificar consistência documental de `docs/API.md:26-40` e
   `requirements/REQUIREMENTS.md` (AC-SIM2-001, AC-SIM2-005).
6. Avaliar a superfície registrada em SYSTEMIC_FIX_REQUIRED (`sendPayment`) quanto
   à necessidade de finding próprio.

---

SanaCore não declara `RETEST_PASSED` nem `FINDING CLOSED`.
FIND-SIM-002-002 e FIND-SIM-002-011 permanecem `RETEST_REQUIRED`.
