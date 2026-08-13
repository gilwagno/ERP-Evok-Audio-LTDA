# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)

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

COMMIT_HASH:            # preenchido após commit (ver abaixo)
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
