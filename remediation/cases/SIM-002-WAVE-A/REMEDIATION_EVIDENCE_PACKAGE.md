# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)
CASE_ID: SIM-002-WAVE-A
FINDING_ID: FIND-SIM-002-001 (CRITICAL), FIND-SIM-002-007 (HIGH), FIND-SIM-002-008 divergência B (MEDIUM — escopo parcial)

AUDIT_ID: SIM-002-AUD-001
AUDIT_COMMIT: f2fcf1c78a6a1255738d05e66a6100fa9c47428a
PROJECT_ID: SIM-002
REMEDIATION_DATE: 2026-08-13
STATUS_DECLARADO: REMEDIATION_COMPLETE — os findings permanecem `RETEST_REQUIRED`.
SanaCore não declara `RETEST_PASSED` nem `FINDING CLOSED` (Regras 3 e 4 do `CLAUDE.md`).

ESCOPO EXPLICITAMENTE EXCLUÍDO: **divergência A de FIND-SIM-002-008** (papel exigido
por `createPayment`: `manager` no documento × `['analyst','manager']` no código).
Bloqueada por human gate (Regra 18) — nenhuma linha de `PAYER_ROLES`,
`docs/API.md:65` (papel) ou `SOFTWARE_RELEASE_PACKAGE.md:28` foi tocada.

---

## 1. REPRODUÇÃO PRÉVIA (antes da correção, no worktree em `f2fcf1c` + WAVE-A)

FIND-SIM-002-001 — reproduzido executando o passo-a-passo do finding:
```
REPRO FIND-001: analyst+49999 => approved 49999
```
Esperado por BR-APR-001: recusa. Confirmado o defeito.

FIND-SIM-002-007 — reproduzido pelo mutation check do próprio finding:
guarda de `src/paymentService.js:51-53` neutralizada (`if (false && ...)`) e suíte
executada: `✔ TC-SIM2-003b` — o teste **passou** com a regra removida. Confirmada
a nulidade de evidência.

FIND-SIM-002-008-B — verificado por leitura: `docs/API.md:67` dizia
`status: "pending"` contra `created` em `paymentService.js:58`, `schema.sql:27`,
`DATA_DICTIONARY.md:44`, `REQUIREMENTS.md:42-43` e `payments.test.js:36`.

---

## 2. ROOT_CAUSE (por finding)

**FIND-SIM-002-001** — Transcrição incorreta do valor normativo da BR-APR-001 para
o código (`10000` → `50000`), em constante literal sem qualquer âncora à regra:
não havia referência à BR na fonte, nem teste de fronteira, nem constraint no DDL,
nem validação a montante. A causa sistêmica não é "o número errado": é que **o
valor de política de negócio estava desacoplado da sua norma e da suíte** —
qualquer erro de transcrição era silencioso. Os dois testes existentes usavam
8000 e 200000, ambos fora da faixa discriminante 10.001–50.000, de modo que a
suíte era estruturalmente cega ao defeito.

**FIND-SIM-002-007** — Uso de `try/catch` com bloco `catch` vazio como substituto
de asserção de rejeição, sem `assert.fail()` no caminho de sucesso. Causa
sistêmica: ausência de qualquer mecanismo que detecte teste sem poder
discriminatório (sem lint de teste, sem cobertura, sem mutation testing), somada
ao fato de o resultado agregado `12/12 PASS` ter sido usado como evidência de
release. A guarda de produto (`paymentService.js:51-53`) estava correta — o
defeito era exclusivamente da evidência de teste, e nenhuma linha dela foi
alterada.

**FIND-SIM-002-008 (divergência B)** — Contrato de API redigido a partir de estado
anterior/imaginado da implementação e nunca reconciliado; o valor `pending`, que é
o status default de **fornecedor** (`schema.sql:14`), foi transposto por engano
para a seção de pagamento. Erro documental isolado, sem ambiguidade normativa.

---

## 3. LOCAL_FIX

**FIND-SIM-002-001** — `product/SIM-002/src/approvalService.js`:
`ANALYST_APPROVAL_LIMIT` passou de `50000` para `10000`, com bloco JSDoc citando
BR-APR-001 textualmente, declarando a fronteira como **inclusiva** e explicando
por que a comparação é `>` estrita (e não `>=`). Comentário adicional na própria
guarda. **A expressão da guarda não foi alterada** — auditada e confirmada
correta: `creditLimit > ANALYST_APPROVAL_LIMIT` recusa apenas *acima* de
10.000,00, que é exatamente o que "até R$ 10.000,00 (inclusive)" exige.

**FIND-SIM-002-007** — `product/SIM-002/tests/payments.test.js`: TC-SIM2-003b
reescrito com `await assert.rejects(..., /excede o limite/)` mais asserção de
pós-condição relida do banco. Adicionados TC-SIM2-003d, 003e e 003f. Helpers
`countPayments` (`SELECT COUNT(*)`) e `sumPayments` (`SUM(amount)` de não
cancelados) leem o banco diretamente, sem passar pelo serviço sob teste.

**FIND-SIM-002-008-B** — `product/SIM-002/docs/API.md`: saída de `createPayment`
passa a `status: "created"`, com nota de que os status válidos de pagamento são
`created`/`sent`/`cancelled` e que `pending` é status de fornecedor.

**Doc adjacente à correção de FIND-001** — `docs/API.md`, seção `approveSupplier`:
a alçada, que antes era apenas qualitativa ("dentro da sua alçada" — apontado como
lacuna em `FIND-SIM-002-001 REFERENCE`), passa a numerar R$ 10.000,00 inclusive,
citando BR-APR-001. Valor transcrito da BR; nenhuma regra inventada (Regra 6).

---

## 4. SYSTEMIC_FIX_REQUIRED (fora do blast radius desta onda — NÃO implementado)

Registrado para decisão de quem tem autoridade; não executado aqui para não
exceder o escopo dos findings desta onda:

1. **Parametrização de valores de política de negócio** — teto de alçada continua
   sendo constante literal em código. O sistêmico seria uma tabela de parâmetros
   versionada (ou config com âncora de BR) e teste que compare o parâmetro à
   norma. Mitigação parcial já entregue: TC-SIM2-002i ancora a constante ao valor
   normativo, de modo que uma alteração silenciosa passa a quebrar a suíte.
2. **Defesa em profundidade sobre `credit_limit`** — não existe `CHECK`, trigger
   nem teto absoluto no DDL (`schema.sql`). Uma alçada errada não encontra
   nenhuma barreira secundária. Requer decisão de arquitetura/dados.
3. **Segregação de funções concessão × consumo de crédito** — o mesmo papel
   `analyst` aprova o crédito e o consome. Depende diretamente da divergência A de
   FIND-SIM-002-008, que está em human gate. **Não tratado nesta onda.**
4. **Gate de qualidade que detecte teste sem poder discriminatório** — mutation
   testing ou, no mínimo, lint proibindo `catch` vazio em arquivo de teste. Sem
   isso, o antipadrão de FIND-007 pode reaparecer.
5. **Varredura completa do antipadrão na suíte** — a `RECOMMENDATION` de FIND-007
   pede revisão da suíte inteira. Executada como verificação nesta onda (ver §7,
   item "varredura"), sem outras ocorrências; mas continua sem mecanismo
   automatizado que a sustente ao longo do tempo.
6. **Reconciliação periódica contrato × código** — a divergência B existiu porque
   nada verifica `docs/API.md` contra a implementação. Sem teste de contrato, a
   correção documental é durável apenas por disciplina.

---

## 5. BLAST_RADIUS

**FIND-SIM-002-001** — MÉDIO. `ANALYST_APPROVAL_LIMIT` é exportado por
`approvalService.js` e, verificado por busca em todo o repositório, consumido
apenas por esse módulo e, agora, pelo teste de ancoragem. Não há chamadores de
`approveSupplier` fora dos testes (não existe transporte HTTP). O efeito
comportamental é restrito à faixa 10.000,01–50.000,00 aprovada por `analyst`:
o que antes era aceito passa a ser recusado. **Efeito de segunda ordem**: como
`credit_limit` é o teto consumido por `createPayment`
(`paymentService.js:51`), fornecedores aprovados por analista passam a ter teto
de pagamento menor. Não há migração de dados nesta onda: fornecedores já
aprovados acima de 10.000 por analista **permanecem** com o limite concedido
(ver RESIDUAL_RISK).

**FIND-SIM-002-007** — BAIXO em produto, ALTO em assurance. Nenhuma linha de
`src/` foi alterada. O efeito é a suíte passar a ter poder discriminatório sobre
BR-PAY-001, que antes estava efetivamente sem cobertura.

**FIND-SIM-002-008-B** — BAIXO. Documental. Não há consumidor de integração no
repositório; nenhum código depende do texto.

**Superfície total tocada:** 1 arquivo de produção, 2 arquivos de teste, 1
documento. Sem alteração de DDL, de schema, de assinatura pública ou de
comportamento de `paymentService.js`.

---

## 6. CORRECTION_STRATEGY

Correção mínima e ancorada, sem refatoração oportunista (nenhuma mudança estética
fora do blast radius). Ordem executada: REPRODUCE → ROOT CAUSE → BLAST RADIUS →
DESIGN → IMPLEMENT → REGRESSION. Cada finding recebeu testes que **falham contra
o código anterior à correção**, verificado por mutation check explícito (§10), de
modo que a VeriCore possa reproduzir o poder discriminatório sem confiar na
palavra da SanaCore. Nenhuma regra de negócio foi criada ou interpretada: todos os
valores vêm literalmente de BR-APR-001 e BR-PAY-001.

---

## 7. FILES_CHANGED / FILES_AFFECTED

| Arquivo | Natureza | Finding |
|---|---|---|
| `product/SIM-002/src/approvalService.js` | produção — constante + comentários normativos | FIND-001 |
| `product/SIM-002/tests/approval.test.js` | teste — 5 casos novos | FIND-001 |
| `product/SIM-002/tests/payments.test.js` | teste — 003b reescrito + 3 casos novos + 2 helpers | FIND-007 |
| `product/SIM-002/docs/API.md` | documentação — `createPayment` (status) e `approveSupplier` (alçada numérica) | FIND-008-B / FIND-001 |

**NÃO alterados, deliberadamente:**
- `product/SIM-002/src/paymentService.js` — a guarda de teto está correta
  (confirmado também pelo finding-validator); FIND-007 é defeito de teste. O
  arquivo foi restaurado bit a bit após os mutation checks (`git checkout --`),
  e não consta do diff.
- `product/SIM-002/src/schema.sql`, `requirements/*` — nada a corrigir; a norma
  está correta, o código é que divergia.
- `product/SIM-002/SOFTWARE_RELEASE_PACKAGE.md` — o bloco `TEST_RESULTS:` (`:31-34`)
  ficou **desatualizado** (declara `tests 12 / pass 12`, incluindo TC-SIM2-003b na
  sua forma inválida; a suíte agora tem 20 testes). A SanaCore **não** o editou:
  é evidência de release pertencente à OpusCore (Regra 15 — nenhuma organização
  altera evidência histórica de outra) e refere-se ao `AUDIT_COMMIT` congelado.
  Registrado aqui como **pendência apontada à OpusCore/Director** para o próximo
  corte de release. Recomendo que a VeriCore trate esta desatualização como item
  de reteste do pacote de release, não como remediação em falta.
- `audit/` — não tocado (Regras 2 e 15). Área selada do control plane — não
  acessada.

**Varredura do antipadrão (pedida pela RECOMMENDATION de FIND-007):** revisados os
três arquivos de teste. Após esta remediação não resta nenhum `catch` vazio nem
bloco de teste sem asserção: todos os `try` remanescentes são `try/finally` para
`ctx.close()`, sem `catch`. Os caminhos negativos usam `assert.throws` /
`assert.rejects`.

---

## 8. TESTS_ADDED

Aprovação (`tests/approval.test.js`) — cobrindo os 4 cenários do
`RETEST_SPECIFICATION` de FIND-SIM-002-001:
- `TC-SIM2-002e` — `analyst` + 10000 → **aceita**; `status = approved`,
  `credit_limit = 10000` (fronteira inclusiva).
- `TC-SIM2-002f` — `analyst` + 10000.01 → **recusa** + pós-condição relida do
  banco: `status = 'pending'`, `credit_limit = 0`, `approved_by = null`,
  `approved_at = null`.
- `TC-SIM2-002g` — `analyst` + 49999 → **recusa** + pós-condição (cenário 3 do
  finding: a faixa que passava indevidamente).
- `TC-SIM2-002h` — `manager` + 25000 → **aceita**.
- `TC-SIM2-002i` — ancoragem: `ANALYST_APPROVAL_LIMIT === 10000`, ligando a
  constante ao valor normativo da BR-APR-001.

Pagamentos (`tests/payments.test.js`):
- `TC-SIM2-003d` — acumulado do design desta onda: limite 5000; 3000 aceito;
  2500 **recusado**; total persistido permanece 3000 e `COUNT(*) == 1`.
- `TC-SIM2-003e` — acumulado exigido pelo `RETEST_SPECIFICATION` item 3: limite
  10000; 6000 aceito; 5000 **recusado**; total permanece 6000.
- `TC-SIM2-003f` — fronteira exata (item 4): 4000 + 1000 == 5000 → **aceito**
  (`status = created`); em seguida +0,01 → **recusado**, sem persistência.
- Helpers `countPayments` / `sumPayments`, que consultam o banco diretamente.

## 9. TESTS_CHANGED

- `TC-SIM2-003b` **reescrito** (era `tests/payments.test.js:43-60`): `try/catch`
  vazio substituído por `await assert.rejects(..., /excede o limite/)` **mais**
  asserção de não-persistência (`SELECT COUNT(*)` = 0 antes e depois, e soma = 0).
- Testes preexistentes `TC-SIM2-002` (8000) e `TC-SIM2-002b` (200000) foram
  **mantidos** — continuam válidos, mas não substituem os de fronteira, conforme
  o design da remediação.
- Nenhum teste foi removido.

---

## 10. TEST_RESULTS (execução real)

Comando: `node --test "product/SIM-002/tests/**/*.test.js"`
Ambiente: Node.js v24.18.0, Windows, worktree `ERP-Evok-sana-A`, branch `sana/SIM-002/WAVE-A`.

```
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 101.772
```

Todos os 20 testes PASS (12 originais + 8 novos; TC-SIM2-003b reescrito conta no
total original). Baseline antes da remediação, no mesmo worktree: `tests 12 / pass 12`.

### Prova de discriminação (mutation checks executados)

Mutação A — `ANALYST_APPROVAL_LIMIT` revertido para `50000`, executando
`node --test product/SIM-002/tests/approval.test.js`:
```
✖ TC-SIM2-002f: analista com 10000.01 e recusado e o fornecedor permanece intacto
✖ TC-SIM2-002g: analista com 49999 e recusado (faixa que passava indevidamente)
✖ TC-SIM2-002i: a constante de alcada esta ancorada no valor normativo da BR-APR-001
```
Os novos testes **falham** contra o código do `AUDIT_COMMIT`, como exige o
critério de aprovação do finding (cenário 3 em especial).

Mutação B — guarda de `paymentService.js:51` neutralizada (`if (false && ...)`),
executando `node --test product/SIM-002/tests/payments.test.js`:
```
✖ TC-SIM2-003b: pagamento acima do limite de credito e rejeitado e nada e persistido
✖ TC-SIM2-003d: o teto considera a soma acumulada, nao o valor isolado
✖ TC-SIM2-003e: caso acumulado do RETEST_SPEC — limite 10000, 6000 aceito e 5000 recusado
✖ TC-SIM2-003f: soma exatamente igual ao limite e aceita; limite + 0,01 e recusado
```
Item 5 do `RETEST_SPECIFICATION` de FIND-007 satisfeito. Para contraste, o
TC-SIM2-003b **original** passava sob esta mesma mutação (`✔`), o que é a
demonstração direta do finding.

Ambas as mutações foram revertidas; `paymentService.js` foi restaurado via
`git checkout --` e está idêntico ao `AUDIT_COMMIT`.

---

## 11. REGRESSION_ANALYSIS / REGRESSION_RISK

**Risco global: BAIXO-MÉDIO.**

- Todos os 12 testes preexistentes continuam PASS, sem edição de nenhum deles
  (exceto o próprio TC-SIM2-003b, objeto do finding). Nenhuma regressão detectada.
- `TC-SIM2-002` (8000) e `TC-SIM2-002c` (manager 250000) continuam verdes,
  confirmando que a redução do teto não afetou nem a faixa baixa do analista nem
  a ausência de teto para `manager`.
- **Regressão funcional intencional**: aprovações de `analyst` na faixa
  10.000,01–50.000,00, que antes eram aceitas, passam a ser recusadas. É
  precisamente o comportamento exigido pela BR-APR-001 — não é efeito colateral,
  é a correção. Consumidores que dependessem do comportamento anterior estariam
  dependendo de uma violação de regra de negócio.
- Sem alteração de contrato de função, assinatura, schema ou formato de retorno.
- Sem alteração em `paymentService.js`: o comportamento de pagamento é
  bit-a-bit o mesmo; apenas passou a ser verificado.
- Risco de flakiness: nulo. Testes determinísticos, banco SQLite em memória
  isolado por teste, sem relógio, rede ou concorrência.
- Observação de ponto flutuante: TC-SIM2-003f soma 4000 + 1000 = 5000 exatos e
  usa 0,01 apenas como valor isolado acima do teto, evitando dependência de
  acumulação binária imprecisa. TC-SIM2-002f usa 10000.01 numa comparação simples
  `>` contra 10000, sem soma — seguro.

---

## 12. ARCHITECTURE_IMPACT

Nenhum. Nenhuma camada, fábrica, dependência ou fluxo foi alterado. A correção é
de valor de política dentro de um serviço existente.

## 13. DATABASE_IMPACT

Nenhum no schema: `schema.sql` intocado, sem migração, sem novo índice ou
constraint. **Impacto de dados existentes**: bases já em uso podem conter
fornecedores com `credit_limit` entre 10.000,01 e 50.000,00 aprovados por
`analyst` sob a regra defeituosa. A correção **não** os retifica — ver
RESIDUAL_RISK. Não foi escrito script de saneamento porque isso implicaria
decidir o destino de crédito já concedido (rebaixar? revogar? exigir
reaprovação gerencial?), decisão de negócio que a SanaCore não tem autoridade
para tomar (Regra 6).

## 14. API_IMPACT

`docs/API.md` passa a descrever fielmente a implementação quanto ao status de
saída de `createPayment` (`created`) e quanto à alçada numérica de
`approveSupplier`. Nenhuma mudança de assinatura ou de formato de retorno.
**A linha de papel exigido de `createPayment` (`manager`) foi deixada intacta** —
divergência A permanece aberta em human gate.

## 15. SECURITY_CHECKS

- FIND-001 é falha de controle de autorização por valor (privilege scope):
  reexecutado o cenário de exploração do finding (`analyst` + 49999) após a
  correção → recusado, com fornecedor permanecendo `pending` / `credit_limit = 0`
  (TC-SIM2-002g assere isso relendo o banco).
- Verificado que a guarda não pode ser contornada por papel: `manager` continua
  sem teto (por desenho da BR-APR-001), e papéis fora de `APPROVER_ROLES`
  continuam recusados antes de qualquer avaliação de valor.
- Verificado que o teto de consumo (`createPayment`) permanece atado ao
  `credit_limit` do fornecedor, agora corretamente limitado na origem.
- **Não corrigido, por bloqueio de gate**: a segregação de funções permanece
  quebrada enquanto `PAYER_ROLES` incluir `analyst` — o mesmo papel aprova e
  paga. Isso é a divergência A de FIND-SIM-002-008 e a ressalva registrada pelo
  finding-validator em FIND-001. A redução da alçada para 10.000 **reduz a
  exposição** (de R$ 50.000 para R$ 10.000 por fornecedor) mas não elimina a
  ausência de segunda pessoa.
- Sem dependências externas; nada a auditar em cadeia de suprimentos nesta onda.

## 16. DOCUMENTATION_UPDATED

- `product/SIM-002/docs/API.md` — `createPayment`: `status: "created"` +
  enumeração dos status válidos (FIND-008-B).
- `product/SIM-002/docs/API.md` — `approveSupplier`: alçada numerada em
  R$ 10.000,00 inclusive, com citação de BR-APR-001.
- `product/SIM-002/src/approvalService.js` — documentação normativa embutida
  (JSDoc citando BR-APR-001 e justificando a comparação estrita).
- Não requereram alteração (já corretos): `BUSINESS_RULES.md`,
  `REQUIREMENTS.md`, `DATA_DICTIONARY.md`, `schema.sql`.
- Pendência apontada a terceiros: `SOFTWARE_RELEASE_PACKAGE.md` `TEST_RESULTS`
  (ver §7).

---

COMMIT_HASH: f0aaa7aeea78d274250d5924c215aff09064a878   # REMEDIATION_COMMIT
  (commit da correção: código + testes + docs. Este pacote de evidência é
   commitado logo em seguida no mesmo branch, por não poder conter o próprio
   hash. O `REMEDIATION_COMMIT` a ser retestado é f0aaa7a.)
BRANCH: sana/SIM-002/WAVE-A
WORKTREE: C:/Gilwagno WorkSpace/ERP-Evok-sana-A
AUDIT_COMMIT (não substituído): f2fcf1c78a6a1255738d05e66a6100fa9c47428a

## RESIDUAL_RISK

1. **Dados legados não saneados (MÉDIO)** — fornecedores aprovados por `analyst`
   acima de 10.000 antes da correção mantêm o `credit_limit` indevido e, portanto,
   a capacidade de pagamento indevida. Exige decisão de negócio sobre saneamento.
   No simulado não há base persistente, mas a VeriCore deve registrar o item.
2. **Segregação de funções (ALTO, fora de escopo)** — depende da decisão humana
   da divergência A de FIND-SIM-002-008. Enquanto pendente, o ciclo
   aprovar→pagar continua executável por um único papel.
3. **Ausência de barreira secundária (MÉDIO)** — sem `CHECK` no DDL nem teto
   absoluto, uma futura alteração da constante volta a ser o único ponto de
   falha. Mitigado parcialmente por TC-SIM2-002i, que quebra a suíte se a
   constante divergir da norma — mas um alterador determinado pode mudar os dois.
4. **Não durabilidade do alinhamento contrato × código (BAIXO)** — não há teste
   de contrato sobre `docs/API.md`; a divergência B pode reaparecer.
5. **Unicidade de CNPJ (FIND-SIM-002-005, fora desta onda)** — enquanto o mesmo
   CNPJ puder ser recadastrado, a exposição por fornecedor continua multiplicável,
   ainda que agora em parcelas de 10.000 em vez de 50.000.

## RETEST_INSTRUCTIONS (para a VeriCore)

1. Fazer checkout do `REMEDIATION_COMMIT` no branch `sana/SIM-002/WAVE-A`.
2. Executar `node --test "product/SIM-002/tests/**/*.test.js"` — esperado
   `tests 20 / pass 20 / fail 0`.
3. FIND-001: conferir os 4 cenários do `RETEST_SPECIFICATION` em
   TC-SIM2-002e/f/g/h e confirmar que 002f e 002g releem o banco (pós-condição),
   não apenas a exceção. Reproduzir o passo-a-passo do finding
   (`analyst` + 49999) e confirmar recusa.
4. FIND-001, prova de discriminação: alterar `ANALYST_APPROVAL_LIMIT` para 50000
   e confirmar que 002f, 002g e 002i **falham**; reverter.
5. FIND-007: conferir que TC-SIM2-003b tem `assert.rejects` com
   `/excede o limite/` **e** `COUNT(*)`; neutralizar a guarda de
   `paymentService.js:51-53` e confirmar que 003b/003d/003e/003f **falham**;
   reverter. Confirmar que `paymentService.js` está idêntico ao `AUDIT_COMMIT`.
6. FIND-008: verificar `docs/API.md` — nenhuma ocorrência de `pending` na seção
   de pagamentos; e confirmar que a linha de **papel exigido** de `createPayment`
   permanece inalterada (`manager`), pois a divergência A segue em human gate.
   Conforme o item 3 do próprio `RETEST_SPECIFICATION`, **FIND-SIM-002-008
   permanece aberto** mesmo com a divergência B corrigida.
7. Avaliar as pendências de §4 (SYSTEMIC_FIX_REQUIRED) e de §7
   (`SOFTWARE_RELEASE_PACKAGE.md` desatualizado) como itens de encaminhamento,
   não como remediação em falta.

---

DECLARAÇÃO SanaCore: **REMEDIATION_COMPLETE** para FIND-SIM-002-001,
FIND-SIM-002-007 e para a divergência B de FIND-SIM-002-008.
Os findings permanecem em `RETEST_REQUIRED`. Somente a VeriCore pode declarar
`RETEST_PASSED` e `FINDING CLOSED` (Regra 4 do `CLAUDE.md`).
