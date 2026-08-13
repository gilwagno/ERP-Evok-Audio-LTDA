# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)

CASE_ID: SIM-002-WAVE-E
FINDING_ID: FIND-SIM-002-014 (HIGH) · OBS-SIM-002-007 (MEDIUM) · OBS-SIM-002-008-c (MEDIUM)
PROJECT_ID: SIM-002
BRANCH: `sana/SIM-002/WAVE-E` (criada de `bba830f`, WAVE-D já integrada)
REMEDIATION_COMMIT: `ac3e2770df4eb6b7b822868cb8bfb644af206229`
BASE_COMMIT: `bba830f` (merge da WAVE-D em `main`)
AUDIT_COMMIT de referência: `f2fcf1c78a6a1255738d05e66a6100fa9c47428a` — **não substituído** por este pacote.
DECISÕES HUMANAS HABILITANTES: APR-2026-011, APR-2026-012, APR-2026-013
(`coretriad/governance/APPROVALS.md`).

STATUS DECLARADO: **REMEDIATION_COMPLETE**. Os findings permanecem
**RETEST_REQUIRED**. Esta organização não declara `RETEST_PASSED` nem
`FINDING CLOSED` (Regras 3 e 4 do `CLAUDE.md`).

---

## 0. REPRODUÇÃO PRÉVIA (executada ANTES de qualquer correção)

Executada contra `bba830f` com o harness versionado (`tests/support.js`), sem
instrumento novo. Saída literal:

```
users.role de ana = analyst
REPRO-1 [FIND-014] ACEITO indevidamente: { status: 'approved', credit_limit: 50000, approved_by: 'ana' }
REPRO-1b [FIND-014] usuario INEXISTENTE aprovou: { status: 'approved', credit_limit: 999999, approved_by: 'nao-existe' }
REPRO-2 [OBS-007] analyst CANCELOU: cancelled
REPRO-3 [OBS-008-c] envio #4 aceito pelo serviço, status=failed
REPRO-3 [OBS-008-c] envio #5 aceito pelo serviço, status=failed
REPRO-3 [OBS-008-c] envio #6 aceito pelo serviço, status=failed
REPRO-3 [OBS-008-c] envio #7 aceito pelo serviço, status=failed
REPRO-3 chamadas ao gateway: 7 | tentativas persistidas: 7
```

Leitura da prova:

1. **FIND-014 reproduzido de forma exata**, incluindo o cenário do
   `RETEST_SPECIFICATION` item 1: `ana` é `analyst` em `users`, o payload
   declarou `role:'manager'`, e a aprovação de **R$ 50.000** foi **aceita** — 5x
   acima do teto da BR-APR-001. O adicional REPRO-1b mostra que **nem sequer era
   preciso existir**: um `approver.id` inexistente aprovou R$ 999.999 e ficou
   registrado como autor em `approved_by`.
2. **OBS-007 reproduzido**: `analyst` cancelou pagamento `created`.
3. **OBS-008-c reproduzido**: 7 chamadas explícitas de `sendPayment`, 7
   submissões ao gateway, 7 linhas de trilha — sem qualquer teto.

O script de reprodução é descartável e **não** foi versionado no produto; o que
ficou versionado é a suíte de regressão (§5), que cobre os mesmos cenários com
oráculo permanente.

---

## 1. FIND-SIM-002-014 — alçada de aprovação por papel autodeclarado

**ROOT_CAUSE.** Não é "a linha 37 usa `approver.role`". A causa é que
`approvalService` **nunca teve sujeito**: ele recebia um objeto `approver` e o
tratava como asserção verdadeira sobre papel, empresa e identidade. A WAVE-D
criou a fonte confiável (`users` + `identity.js`) e a ligou aos serviços que a
APR-2026-008 alcançava; a aprovação ficou fora do enunciado da decisão e, por
Regra 6, não foi estendida por conta própria. O produto passou a ter **dois
padrões de confiança**, e o mais permissivo era o que concedia crédito. A
APR-2026-011 supriu a norma que faltava.

**LOCAL_FIX.** `product/SIM-002/src/approvalService.js`:
- `createApprovalService(db)` instancia o **mesmo** `createIdentityResolver(db)`
  usado por `paymentService` e `supplierService` — não há segundo caminho de
  identidade;
- `approveSupplier` abre com
  `identity.authorize(approver, APPROVAL_ROLES, APPROVAL_DENIED_MESSAGE)`;
- a alçada da BR-APR-001 testa `principal.role` (banco), não `approver.role`;
- o tenant da consulta de fornecedor usa `principal.companyId` (BR-SEC-001);
- `approved_by` grava `String(principal.id)` — a trilha registra quem o sujeito
  **é**, fechando também a via de OBS-SIM-002-001 (coerção para `"77.0"`);
- as validações de **forma** substituídas (`APPROVER_ROLES.includes(...)` e
  `Number.isInteger(approver.companyId)` → `Aprovador inválido`) desapareceram
  porque eram verificações de forma sobre dado não confiável; a verificação de
  **procedência** as torna redundantes. A mensagem
  `Aprovador inválido` deixou de existir — ver ARQUIVO §9 (impacto de contrato).

**SYSTEMIC_FIX_REQUIRED.** Sim, e é a parte que interessa ao reteste: a correção
sistêmica é **BR-SEC-003** (`requirements/BUSINESS_RULES.md`), que promove a
procedência de papel de regra do módulo de pagamentos a **regra do produto**,
válida para toda operação. Sem ela, a próxima operação criada repetiria o
defeito — foi exatamente assim que este finding nasceu. O que **não** foi feito
por não haver decisão que o autorize: nada além do SIM-002 foi tocado; a
cláusula de elevação (a) do finding (promoção do padrão a projeto real) segue
sendo assunto de outra decisão.

**BLAST_RADIUS.** `approvalService.approveSupplier` é chamado por 4 arquivos de
teste e por nenhum outro módulo de produção. Todo consumidor que hoje monta
`approver` com `role`/`companyId` continua funcionando **se e somente se** o
`approver.id` existir em `users` com o papel adequado. Chamadores que dependiam
de papel autodeclarado **quebram por desenho** — é o efeito pretendido.

---

## 2. OBS-SIM-002-007 — quem cancela pagamento `created` (APR-2026-012)

**ROOT_CAUSE.** Lacuna normativa, não defeito de implementação: a APR-2026-007
arbitrou *quando* se cancela e não *quem* cancela, e o código preencheu o vazio
com o conjunto mais permissivo disponível (`READ_ROLES`). Cancelar libera
crédito comprometido (`sumCommittedAmount`), ou seja, é escrita de efeito
financeiro exercida sob autorização de leitura.

**LOCAL_FIX.** `paymentService.cancelPayment` passa a autorizar com
`PAYMENT_CANCEL_ROLES` (`['manager']`), resolvido no banco. Constante **própria**
em `identity.js`, deliberadamente não reaproveitando `PAYMENT_WRITE_ROLES`: o
conteúdo coincide hoje por acaso normativo (duas decisões distintas,
APR-2026-008 e APR-2026-012), e unificá-las faria uma mudança futura em uma
arrastar a outra sem decisão.

**SYSTEMIC_FIX_REQUIRED.** Sim: a matriz de autorização em BR-SEC-002/API.md
passou a listar **todas** as operações, inclusive aprovação e cancelamento, para
que "operação sem papel arbitrado" volte a ser visível como omissão.

**BLAST_RADIUS.** Todos os cancelamentos. Verificado que os 3 testes de
cancelamento pré-existentes (WAVE-C e WAVE-D) já usavam `manager` — nenhum
precisou ser alterado, o que é evidência de que a decisão humana ratificou a
prática corrente e não a inverteu.

---

## 3. OBS-SIM-002-008-c — limite de reenvio de pagamento `failed` (APR-2026-013)

**ROOT_CAUSE.** A APR-2026-009 normatizou o **estado** `failed` e não o **ciclo
de vida** dele. Sem teto, o `failed` reintroduzia por outra porta a pressão sobre
BR-PAY-002 que FIND-003 tratou: 7 chamadas → 7 movimentações tentadas.

**LOCAL_FIX.** `paymentService.sendPayment`, guarda **antes** do gateway e antes
de qualquer escrita:

```js
if (payment.status === 'failed'
  && countFailedAttempts(payment.id) >= MAX_GATEWAY_SUBMISSIONS) {
  throw new Error(RETRY_EXHAUSTED_MESSAGE);
}
```

**Interpretação do limite — declarada porque é a decisão interpretativa mais
contestável deste pacote.** A APR-2026-013 diz "limite de **3 tentativas de
reenvio** ao gateway **para um pagamento em `failed`**". O envio original não é
reenvio: ele é o ato que *produz* o `failed`. Logo:

| Chamada de `sendPayment` | Natureza | Resultado |
|---|---|---|
| 1ª | envio original | vai ao gateway; recusado → `failed` |
| 2ª, 3ª, 4ª | reenvios 1, 2 e 3 | vão ao gateway |
| 5ª | reenvio 4 | **recusada pelo serviço**, gateway não é tocado |

`MAX_RESEND_ATTEMPTS = 3`, `MAX_GATEWAY_SUBMISSIONS = 4`. Se a VeriCore concluir
que a decisão significava 3 submissões **totais**, a divergência é de **uma
linha** (`MAX_GATEWAY_SUBMISSIONS = MAX_RESEND_ATTEMPTS`) mais os literais dos
testes — mas a mudança é **normativa**, não técnica, e não será feita por
iniciativa desta organização (Regra 6). Registrado em RESIDUAL_RISK.

**Onde a contagem vive, e por quê.** Na trilha `payment_attempts`, contando
linhas com `result = 'failed'` — **sem** coluna `retry_count` em `payments`. A
alternativa da coluna foi considerada e recusada: um contador seria uma **segunda
representação do mesmo fato** já registrado pela trilha, e duas representações
divergem (basta um caminho de escrita esquecer de incrementar). A trilha é o
fato; o contador seria cópia dele. Custo aceito da escolha, documentado no
dicionário de dados: **apagar linhas da trilha reabre o direito de reenvio** —
`payment_attempts` é trilha de auditoria e não deve sofrer expurgo sem decisão.

Propriedades que a implementação garante e o reteste pode conferir:
- a recusa ocorre **antes** do gateway: nenhuma nova chamada, nenhuma nova linha
  de trilha, status inalterado em `failed`;
- **não há retentativa automática** — o serviço nunca reenvia por conta própria;
  o limite incide sobre chamadas explícitas, como a decisão determina;
- a contagem é **persistente**: sobrevive à troca de instância do serviço sobre
  o mesmo banco (TC-SIM2-013b prova);
- um reenvio aceito **dentro** do limite conclui normalmente em `sent`
  (TC-SIM2-013c), com a BR-PAY-002 voltando a governar.

**BLAST_RADIUS.** Apenas o caminho `failed → reenvio`. Pagamentos em `created`
têm zero tentativas e nunca tocam a guarda; `sent` já curto-circuita antes;
`cancelled` já era recusado.

---

## 4. FILES_CHANGED

| Arquivo | Natureza |
|---|---|
| `product/SIM-002/src/approvalService.js` | correção FIND-014 |
| `product/SIM-002/src/paymentService.js` | correção OBS-007 e OBS-008-c |
| `product/SIM-002/src/identity.js` | `PAYMENT_CANCEL_ROLES`, `APPROVAL_ROLES` |
| `product/SIM-002/tests/remediation-wave-e.test.js` | **novo** — 11 testes |
| `product/SIM-002/requirements/BUSINESS_RULES.md` | BR-SEC-003 e BR-PAY-005 novas; BR-APR-001, BR-PAY-003, BR-PAY-004, BR-SEC-002 atualizadas |
| `product/SIM-002/requirements/REQUIREMENTS.md` | AC-SIM2-002b, 004c, 007b, 008b; REQ-002/004/007/008 atualizados |
| `product/SIM-002/requirements/DATA_DICTIONARY.md` | uso normativo de `payment_attempts` como contagem oficial |
| `product/SIM-002/docs/API.md` | matriz de papéis completa, erros novos, contrato de `approver` |

Sem alteração de `schema.sql`: nenhuma migração, nenhuma coluna nova (§3).

## 5. TESTS_ADDED (11, arquivo `remediation-wave-e.test.js`)

| TC | Cobre |
|---|---|
| TC-SIM2-014a | `analyst` real declarando `manager` tentando 50000 → **recusado**; pós-condição relida (`pending`, `credit_limit=0`, `approved_by`/`approved_at` nulos) |
| TC-SIM2-014b | `manager` real aprova 50000; `approved_by` = identidade resolvida, como texto |
| TC-SIM2-014c | `analyst` real aprova 10000 (fronteira inclusiva) e é recusado em 10001 |
| TC-SIM2-014d | `approver.id` inexistente → `Usuário não autenticado`; sem `approver` → `Usuário inválido` |
| TC-SIM2-014e | `companyId` forjado não alcança fornecedor de outra empresa (BR-SEC-001) |
| TC-SIM2-012a | `analyst` **da empresa correta** não cancela; `manager` cancela |
| TC-SIM2-012b | `analyst` declarando `manager` não cancela |
| TC-SIM2-013a | 3 reenvios permitidos, 4º recusado pelo serviço; gateway em 4 chamadas; trilha em 4 linhas; `failed` sem `external_ref`/`sent_at` |
| TC-SIM2-013b | limite persiste em nova instância do serviço sobre o mesmo banco |
| TC-SIM2-013c | reenvio aceito dentro do limite → `sent`, trilha `[failed,failed,failed,accepted]` |
| TC-SIM2-013d | constantes ancoradas em 3 e 4 (APR-2026-013) |

TESTS_CHANGED: **nenhum**. Os 49 testes das ondas A/B/C/D foram executados sem
edição — inclusive os 3 de cancelamento e os 8 de aprovação, cuja sobrevivência
sem alteração é evidência de que a correção não redefiniu comportamento aprovado.

## 6. TEST_RESULTS (resultado real, não declaração)

```
$ node --test "product/SIM-002/tests/**/*.test.js"
ℹ tests 60
ℹ suites 0
ℹ pass 60
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 142.4125
```

Baseline antes da WAVE-E: 49/49. Depois: 60/60 (49 + 11).

## 7. PROVA DE MUTAÇÃO (cada correção revertida isoladamente, depois restaurada)

| Mutante | O que foi revertido | Testes mortos | Suíte |
|---|---|---|---|
| **M1** | `identity.authorize` → `principal` montado do payload (comportamento pré-WAVE-E) | TC-SIM2-014a, 014d, 014e | 57/60 |
| **M2** | `PAYMENT_CANCEL_ROLES` → `READ_ROLES` em `cancelPayment` | TC-SIM2-012a, 012b | 58/60 |
| **M3** | guarda de limite de reenvio removida | TC-SIM2-013a, 013b | 58/60 |
| **M4** | `MAX_RESEND_ATTEMPTS = 3 → 4` (off-by-one no teto) | TC-SIM2-013a, 013b, 013d | 57/60 |
| — | código restaurado | — | **60/60** |

**Achado da própria verificação de mutação, registrado por dever de precisão.**
Na primeira execução de M4 apenas **1** teste morreu (o de ancoragem da
constante): TC-SIM2-013a usava `MAX_RESEND_ATTEMPTS`/`MAX_GATEWAY_SUBMISSIONS`
importados do módulo, de modo que o teste **acompanhava** o teto adulterado em
vez de contestá-lo — um oráculo que se move com o objeto testado não é oráculo.
Os testes comportamentais foram reescritos com **literais 3 e 4**, ancorados na
APR-2026-013 e não no código; a reexecução de M4 passou a matar 3 testes. Fica o
registro de que a fraqueza existiu e de como foi detectada.

TC-SIM2-014b e 014c não morrem sob M1 — corretamente: são os caminhos positivos
(gerente real, analista real), que a correção **não** deve alterar. Sua função é
provar não-regressão de FIND-SIM-002-001 e BR-APR-001, não discriminar o
mutante.

## 8. REGRESSION_ANALYSIS / REGRESSION_RISK

**Risco: BAIXO-MÉDIO**, decomposto:

- **Aprovação (médio).** A superfície de erro mudou: um chamador cujo
  `approver.id` não exista em `users` agora recebe `Usuário não autenticado`
  onde antes recebia aprovação bem-sucedida. Para consumidores in-process do
  simulado isso é o efeito desejado; para qualquer consumidor futuro é ruptura de
  contrato — declarada em API.md.
- **Cancelamento (baixo).** Nenhum teste existente precisou mudar; a restrição
  ratifica a prática vigente.
- **Reenvio (baixo).** A guarda só alcança pagamentos em `failed` que já
  esgotaram 4 submissões. TC-SIM2-009a/009b (WAVE-D) continuam verdes sem edição,
  provando que o caminho normal de recusa e o reenvio aceito não foram afetados.
- **Sem alteração de schema** → sem risco de migração (a lacuna de migração da
  OBS-008-b permanece exatamente onde estava, não foi tocada nem agravada).

## 9. ARCHITECTURE_IMPACT / DATABASE_IMPACT / API_IMPACT

- **ARCHITECTURE:** elimina-se a assimetria apontada no finding — o produto passa
  a ter **um único** mecanismo de identidade (`identity.js`) para 100% das
  operações. Nenhum módulo novo, nenhuma dependência nova.
- **DATABASE:** nenhuma mudança de schema. `payment_attempts` ganha **uso
  normativo** (contagem oficial do limite), documentado no dicionário de dados,
  com a consequência operacional do expurgo registrada.
- **API (mudanças de contrato):**
  - `approvals.approveSupplier` — `approver.role`/`companyId` deixam de ter
    efeito; `approver.id` passa a ser obrigatório e verificado; erros novos
    `Usuário inválido` e `Usuário não autenticado`; **erro removido**:
    `Aprovador inválido`;
  - `payments.cancelPayment` — `analyst` passa a receber
    `Usuário não possui permissão para cancelar pagamentos`;
  - `payments.sendPayment` — erro novo de falha definitiva com exigência de ação
    manual;
  - `paymentService` exporta `MAX_RESEND_ATTEMPTS` e `MAX_GATEWAY_SUBMISSIONS`.

## 10. SECURITY_CHECKS

Findings de autorização (Regra 24). Verificações executadas:
- procedência de **todo** atributo de autorização em **todas** as operações do
  produto — varredura de `src/` por uso de `user.role`/`approver.role`/
  `companyId` do payload em decisão: **nenhuma ocorrência remanescente**;
- negativos versionados para papel forjado, identidade inexistente e tenant
  forjado nas três operações tocadas;
- mensagens de erro preservam o padrão de não vazar existência de recurso de
  outra empresa (`Fornecedor não encontrado` / `Pagamento não encontrado`);
- nenhum segredo, credencial ou dado real envolvido (simulado sem transporte).

## 11. DOCUMENTATION_UPDATED

BR-SEC-003 (procedência do papel vale para todas as operações) e BR-PAY-005
(limite de reenvio) criadas; BR-APR-001, BR-PAY-003, BR-PAY-004 e BR-SEC-002
atualizadas; AC-SIM2-002b, 004c, 007b e 008b criados com TCs rastreados;
API.md com matriz completa, contrato de `approver` e erros novos;
DATA_DICTIONARY.md com o uso normativo da trilha. Todas as regras citam a
aprovação que as originou — nenhuma é interpretação autônoma da SanaCore.

## 12. RESIDUAL_RISK (declarados por iniciativa própria)

1. **Interpretação do teto (o mais relevante).** "3 reenvios + 1 envio = 4
   submissões" é leitura desta organização sobre a APR-2026-013. Se a intenção
   humana era 3 submissões totais, o código está permissivo em uma submissão.
   Decisão normativa, não técnica — não será alterada sem novo gate.
2. **Expurgo da trilha reabre reenvio.** Consequência aceita e documentada de
   contar pela trilha em vez de contador dedicado. Não há hoje controle de
   `DELETE` sobre `payment_attempts`.
3. **`failed` definitivo não tem estado próprio.** Um pagamento esgotado continua
   com `status = 'failed'`, indistinguível por consulta simples de um `failed`
   ainda reenviável — a diferença só aparece contando a trilha. Um estado
   `failed_final` (ou coluna equivalente) seria mais legível para operação, mas
   criá-lo é decisão de domínio que nenhuma aprovação autorizou.
4. **Sem trilha de quem cancelou/aprovou o quê e quando.** FIND-SIM-002-012
   (ausência de `updated_at`/trilha de alteração) segue aberto; a autoria de
   aprovação melhorou (`approved_by` confiável), a de cancelamento não existe.
5. **Cláusula de elevação (a) do FIND-014 permanece pertinente.** O padrão
   corrigido vale para o SIM-002; promovê-lo a projeto real é outra decisão.
6. **OBS-008-a (atomicidade) e OBS-008-b (migração do CHECK)** não foram objeto
   desta onda e permanecem como estavam.

## 13. RETEST_INSTRUCTIONS

1. `cd` no worktree, `node --test "product/SIM-002/tests/**/*.test.js"` → esperado
   60/60.
2. **Teste decisivo de discriminação** (item 7 do `RETEST_SPECIFICATION` do
   FIND-014): executar `TC-SIM2-014a` contra `bba830f` — deve **falhar**; contra
   `ac3e277` — deve **passar**. Idem TC-SIM2-012a e TC-SIM2-013a.
3. Conferir independentemente a interpretação do teto de reenvio (§3 e
   RESIDUAL_RISK 1) — é o ponto onde uma leitura diferente da decisão humana
   muda o veredito.
4. Conferir que nenhum ponto de `src/` decide autorização por atributo de
   payload.
5. Os findings permanecem **RETEST_REQUIRED** até manifestação da VeriCore.
