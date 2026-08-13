# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)

> **STATUS ATUAL: v2 entregue.** A seção `## v2 — resposta ao RETEST_FAILED`
> (no fim deste arquivo) é a evidência corrente. Todo o conteúdo abaixo até
> aquela seção é o **registro histórico da v1** (escopo parcial deliberado)
> e do `RETEST_FAILED` que ela produziu — preservado intencionalmente como
> evidência do drill, **não** como descrição do estado atual do código.

---

## v1 — registro histórico (escopo parcial, RETEST_FAILED)

> **SIM-001 VALIDATION DRILL v1 — escopo intencionalmente parcial** (somente
> verificação de dono; caminho admin propositalmente adiado para v2) para
> exercitar o loop `RETEST_FAILED → IN_REMEDIATION → RETEST_PASSED` do
> CoreTriad state machine. Ver `coretriad/states/SIM-001/`. **Isto NÃO é uma
> correção de produção real e NÃO satisfaz o `FIND-SIM-001-001` por
> completo.** O caminho `userRole === 'admin'` do RETEST_SPECIFICATION
> (item c) permanece **não implementado** por decisão deliberada deste
> exercício e deve ser tratado por uma remediação v2 subsequente.

CASE_ID: SIM-001-CASE-001
FINDING_ID: FIND-SIM-001-001

ROOT_CAUSE:
`cancelBooking` (product/SIM-001/src/bookingService.js, então L78-105) não
executava nenhuma verificação de autorização antes de alterar o status da
reserva para `cancelled`. Os parâmetros `userId`/`userRole` eram usados
apenas como metadata do registro de cancelamento (L96-98 originais), nunca
comparados contra `booking.userId` nem contra um papel privilegiado. Causa
sistêmica: ausência de uma regra de posse/autorização central em
`cancelBooking`, sem nenhuma camada compensatória (controller, middleware,
gateway) no produto SIM-001 — é um serviço em memória de arquivo único.

LOCAL_FIX (PARCIAL — v1 drill):
Adicionada, no início de `cancelBooking`, a verificação
`if (userId !== booking.userId) throw new Error(...)`, rejeitando qualquer
chamador que não seja o dono da reserva e preservando `booking.status` como
`active` quando a verificação falha. **A verificação `userRole === 'admin'`
exigida pelo finding (RETEST_SPECIFICATION item c) NÃO foi implementada
nesta v1** — está deliberadamente fora de escopo, documentada em comentário
no próprio código (bookingService.js) e neste pacote.

SYSTEMIC_FIX_REQUIRED: sim — caminho admin pendente para v2. Além disso, o
finding original registra (SECURITY_IMPACT) que `userRole` é autodeclarado
pelo chamador e não pode ser considerado fonte confiável mesmo quando a
comparação de papel for adicionada em v2; a origem do papel (autenticação/
autorização real, não parâmetro livre) permanece um problema sistêmico
aberto e não tratado por esta v1.

BLAST_RADIUS:
Único arquivo de produção alterado (`bookingService.js`), função
`cancelBooking`. Nenhum outro consumidor de `cancelBooking` identificado no
repositório SIM-001 além da própria suíte de testes.

CORRECTION_STRATEGY:
Guard clause de posse adicionada antes de qualquer mutação de estado,
seguindo o padrão “falha rápida antes de efeito colateral” já usado nas
demais validações da função (`booking not found`, `not active`).

FILES_CHANGED:
- product/SIM-001/src/bookingService.js (guard de posse em `cancelBooking`)

FILES_AFFECTED (para referência de reteste/documentação):
- product/SIM-001/src/bookingService.js
- product/SIM-001/tests/booking.test.js

TESTS_ADDED:
- TC-SIM-005: não-dono tenta cancelar reserva de outro usuário → erro
  "not authorized" lançado; reserva permanece `active` (cobre
  RETEST_SPECIFICATION item a).
- TC-SIM-006: dono cancela a própria reserva → sucesso (cobre
  RETEST_SPECIFICATION item b).

TESTS_CHANGED: nenhum teste existente foi alterado; todos os testes
pré-existentes continuam usando `userId` igual ao dono da reserva, portanto
permanecem verdes sem modificação.

TESTS_NOT_ADDED (declarado, v1 drill): nenhum teste cobre
RETEST_SPECIFICATION item (c) — "admin cancela reserva de terceiro". Este
cenário falharia hoje (usuário com `userRole: 'admin'` que não é o dono
ainda seria rejeitado pela verificação de posse), pois o caminho admin não
foi implementado. Isso é esperado e intencional para este drill.

TEST_RESULTS:
`node --test "product/SIM-001/tests/**/*.test.js"` → 8 testes, 8 pass,
0 fail (inclui as 6 pré-existentes + TC-SIM-005 + TC-SIM-006).

REGRESSION_RISK: baixo. A mudança é um guard clause adicional restrito a
`cancelBooking`; nenhuma outra função foi tocada. Todos os testes
pré-existentes (que cancelam sempre com o próprio `userId`) continuam
passando sem alteração, confirmando ausência de regressão no caminho feliz.
Risco residual conhecido e aceito para este drill: qualquer consumidor
hipotético que dependesse de um `admin` conseguir cancelar reserva de
terceiro quebraria com este v1 — não há tal consumidor no repositório
SIM-001 hoje.

REGRESSION_ANALYSIS: suíte completa de SIM-001 executada (8/8 verde), sem
alterações em `createBooking` ou `listBookings`.

ARCHITECTURE_IMPACT: nenhum.
DATABASE_IMPACT: nenhum (serviço em memória).
API_IMPACT: `cancelBooking` passa a lançar `Error` adicional
("... is not authorized to cancel booking ...") para chamadores que não são
o dono; nenhum parâmetro de assinatura foi alterado.
SECURITY_CHECKS: verificação manual de que a reserva permanece `active`
após tentativa de cancelamento por não-dono (TC-SIM-005, assert em
`listBookings`). Nenhuma varredura de segurança automatizada aplicável a
este serviço em memória de escopo de teste.
DOCUMENTATION_UPDATED: nenhuma (correção de escopo parcial/drill; a
atualização de BUSINESS_RULES.md / requirements referente a BR-SIM-001 fica
para quando a remediação completa — v2, com o caminho admin — for
entregue).

COMMIT_HASH: 3ca9dd9
BRANCH: sana/SIM-001/FIND-001
RESIDUAL_RISK: ALTO — o finding original (broken access control / IDOR)
permanece PARCIALMENTE ABERTO. O caminho `admin` do RETEST_SPECIFICATION
não está implementado. Este pacote não deve ser usado como base para
declarar `RETEST_PASSED` ou `FINDING CLOSED` — apenas VeriCore pode
declarar esses estados, e apenas após uma remediação que cubra os 3 cenários
do RETEST_SPECIFICATION (a, b, c).
RETEST_INSTRUCTIONS: reteste deve seguir o RETEST_SPECIFICATION completo do
FIND-SIM-001-001 (coretriad/handoffs/SIM-001/REMEDIATION_CASE-SIM-001-CASE-001.md,
itens a-e). Espera-se que o item (c) — "admin cancela reserva de terceiro" —
FALHE nesta v1, produzindo `RETEST_FAILED`, o que é o resultado esperado e
desejado deste drill de validação do state machine CoreTriad.

---

## v2 — resposta ao RETEST_FAILED

CASE_ID: SIM-001-CASE-001
FINDING_ID: FIND-SIM-001-001
BRANCH: sana/SIM-001/FIND-001
SUPERSEDES: remediação v1 (commit `3ca9dd9`)

### O QUE O RETEST v1 REPROVOU

Reteste independente executado pela VeriCore sobre o commit `3ca9dd9`
(`AUDIT_COMMIT` da v1), conforme RETEST_SPECIFICATION do FIND-SIM-001-001:

| Item | Cenário | Resultado v1 |
|---|---|---|
| (a) | não-dono (`user-2`, role `user`) cancela reserva de `user-1` | **OK** — ERROR "User user-2 is not authorized..."; reserva permanece `active` |
| (b) | dono (`user-1`) cancela a própria reserva | **OK** — SUCCESS |
| (c) | admin (`userId: 'user-99'`, `userRole: 'admin'`) cancela reserva de `user-1` | **FALHOU** — ERROR "User user-99 is not authorized to cancel booking BKG-1"; esperado SUCESSO |

Veredito do reteste v1: `RETEST_FAILED` no item (c). A guard clause da v1
verificava apenas posse (`userId !== booking.userId`), rejeitando também o
administrador — contrariando BR-SIM-001, que autoriza o cancelamento pelo
**próprio solicitante OU por usuário com papel admin**. Complementarmente, a
suíte v1 (8/8 verde) não continha nenhum teste do caminho admin, razão pela
qual a lacuna não foi capturada pela própria remediação.

### CORREÇÃO APLICADA (v2)

`product/SIM-001/src/bookingService.js`, função `cancelBooking`: a guard
clause de autorização passou a avaliar os dois caminhos previstos por
BR-SIM-001, mantendo a posição original (antes de qualquer mutação de
estado):

```js
// BR-SIM-001: autorizado = dono da reserva OU papel admin.
const isOwner = userId === booking.userId;
const isAdmin = userRole === 'admin';
if (!isOwner && !isAdmin) {
  throw new Error(
    `User "${userId}" is not authorized to cancel booking "${bookingId}"`
  );
}
```

Os comentários que declaravam o adiamento deliberado do caminho admin para
v2 foram removidos/atualizados — no JSDoc de `cancelBooking`, na guard clause
e nos comentários de TC-SIM-005/TC-SIM-006 na suíte de testes — pois não
descrevem mais o comportamento do código.

FILES_CHANGED (v2):
- `product/SIM-001/src/bookingService.js` (guard clause dono-OU-admin;
  comentários de escopo parcial removidos)
- `product/SIM-001/tests/booking.test.js` (TC-SIM-007 adicionado;
  comentários de escopo parcial atualizados)
- `remediation/cases/SIM-001-FIND-001/REMEDIATION_EVIDENCE_PACKAGE.md`
  (esta seção)

TESTS_ADDED (v2):
- **TC-SIM-007** — admin (`userId: 'user-99'`, `userRole: 'admin'`) cancela
  reserva de `user-1` → sucesso; `status === 'cancelled'`, `fee === 0`,
  `cancellation.cancelledBy === 'user-99'`,
  `cancellation.cancelledByRole === 'admin'`, e a reserva deixa de aparecer
  em `listBookings('room-a')`. Cobre o RETEST_SPECIFICATION item (c), o
  cenário exato que reprovou a v1.

TESTS_CHANGED (v2): nenhuma asserção alterada. Apenas os títulos/comentários
de TC-SIM-005 e TC-SIM-006 foram atualizados para remover a rotulagem de
"v1 drill / escopo parcial"; TC-SIM-005 explicita agora que o rejeitado é o
"não-dono **sem papel admin**".

TEST_RESULTS (v2): `node --test "product/SIM-001/tests/**/*.test.js"` →
**9 testes, 9 pass, 0 fail** (as 8 da v1 + TC-SIM-007). Nenhum teste
pré-existente regrediu.

REMEDIATION_COMMIT (v2): `db5c1ef`

SYSTEMIC_FIX_REQUIRED: **não — ambos os caminhos (dono e admin) estão
implementados**, e a suíte cobre os três cenários (a, b, c) do
RETEST_SPECIFICATION. A causa-raiz registrada na triagem (ausência de regra
de autorização central em `cancelBooking`, sem camada compensatória) está
tratada integralmente na única função afetada.

RESIDUAL_RISK (v2): MÉDIO, de natureza distinta do finding remediado. O
SECURITY_IMPACT do finding original observa que `userRole` é **autodeclarado
pelo chamador** — `cancelBooking` confia no parâmetro recebido. Isso é
inerente ao contrato atual da API do SIM-001 (serviço em memória, sem camada
de autenticação) e está **fora do blast radius do FIND-SIM-001-001**: elevar
a origem do papel para uma sessão autenticada exige mudança de arquitetura do
produto e deve ser registrado como finding/decisão própria pela VeriCore, não
absorvido silenciosamente aqui.

REGRESSION_RISK: baixo. A alteração relaxa uma condição de rejeição já
existente para um subconjunto explícito (`userRole === 'admin'`); nenhum
caminho previamente autorizado passou a ser bloqueado. `createBooking` e
`listBookings` não foram tocados.

ARCHITECTURE_IMPACT: nenhum.
DATABASE_IMPACT: nenhum (serviço em memória).
API_IMPACT: a assinatura de `cancelBooking` permanece inalterada. O
parâmetro `userRole`, que na v1 era apenas metadata, passa a ser
semanticamente significativo para a decisão de autorização.
SECURITY_CHECKS: cobertura por teste dos três cenários de autorização (nega
não-dono, permite dono, permite admin), incluindo asserção de que a reserva
permanece `active` no caminho negado. Sem varredura automatizada aplicável a
este serviço de escopo simulado.
DOCUMENTATION_UPDATED: este pacote de evidência. BR-SIM-001 já descrevia o
comportamento agora implementado — o código foi alinhado à regra existente,
sem alteração de regra de negócio.

STATUS: `REMEDIATION_COMPLETE`. O finding FIND-SIM-001-001 permanece
`RETEST_REQUIRED`. SanaCore **não** declara `RETEST_PASSED` nem
`FINDING CLOSED` — autoridade exclusiva da VeriCore (CLAUDE.md, Regras 3 e 4).

RETEST_INSTRUCTIONS (v2): reexecutar o RETEST_SPECIFICATION completo do
FIND-SIM-001-001 (itens a-e) contra o `REMEDIATION_COMMIT` v2 acima. Espera-se
SUCESSO no item (c), mantidos os resultados dos itens (a) e (b).
