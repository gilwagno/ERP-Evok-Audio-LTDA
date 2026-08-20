# REMEDIATION_CASE  (CoreTriad → SanaCore, fase TRIAGEM)
CASE_ID: ERP-LEGACY-001-CASE-019
FINDING_ID: AUD-T01-02
PROJECT_ID: ERP-LEGACY-001
AUDIT_ID: ERP-LEGACY-001-AUD-001
AUDIT_COMMIT: c1311a6f76b512fef893f7e60d934179cae3409f
SEVERITY: HIGH (fixada pela VeriCore — `T-01_TIER1_CADASTRO.md` §3; não reavaliada aqui, Regra 6/18)
CONFIDENCE: CONFIRMED (VeriCore)

EXPECTED_BEHAVIOR: toda escrita nos 12/12 endpoints de cadastro tier 1
(`items`, `categories`, `departments`) grava evento de auditoria com autor e
origem identificáveis (mesmo padrão exigido para `AUD-ALOG-01`).

ACTUAL_BEHAVIOR: zero chamadas de `logAction`/`auditLogService` em
`items|categories|departments` (grep confirmado pela VeriCore); nenhum hook de
model, nenhum middleware global equivalente; apenas a **recusa** (403) é
auditada via `auth.ts:231-241` — a escrita bem-sucedida não deixa rastro.
Incidente medido no próprio repositório: 327 itens reais criados, `audit_logs`
com 2 linhas (`audit-coverage-guard.test.ts:5-12`).

EVIDENCE: `audit/runs/ERP-LEGACY-001-AUD-001/07-findings/T-01_TIER1_CADASTRO.md`
§3 (AUD-T01-02) e §8 (handoffs: T-03 + lista `DEBITO_CONHECIDO`).

REPRODUCTION: estática — grep `logAction|auditLogService` nos três módulos
(zero ocorrências); nenhuma execução, nenhuma conexão de banco necessária para
confirmar a ausência.

FILES: `server/src/modules/items/**`, `server/src/modules/categories/**`,
`server/src/modules/departments/**`, `server/tests/unit/audit-coverage-guard.test.ts`
(lista `DEBITO_CONHECIDO`).

LINES: ver T-01 §3 para as âncoras específicas por endpoint; a SanaCore deve
reconfirmar cada uma no HEAD do seu worktree antes de editar (Regra 12-14 —
este documento não congela linha nenhuma como prova definitiva).

BUSINESS_RULE: N/A — é lacuna de controle técnico (rastreabilidade), não regra
de negócio a inventar.
REQUIREMENT: N/A (referência funcional: mesma exigência já aplicada a
`AUD-ALOG-01`, itens A/B/C/F/G, via CASE-004 e CASE-014).
USE_CASE: N/A

TECHNICAL_IMPACT: sem trilha de auditoria em 12/12 endpoints de escrita do
cadastro-mestre (itens, categorias, departamentos) — carga, edição e exclusão
lógica não são atribuíveis a usuário/origem.
BUSINESS_IMPACT: impossibilidade de investigar quem alterou dado de catálogo
usado por produção real (327 itens carregados).
SECURITY_IMPACT: ausência de trilha facilita e esconde adulteração de
cadastro-mestre; mesma classe de risco de `AUD-ALOG-01` (que já tem 5/8 itens
em remediação — CASE-004, CASE-014).

RECOMMENDATION: a SanaCore deve triar como novo caso, verificando
especificamente se os 12 endpoints de `AUD-T01-02` coincidem, se sobrepõem
parcialmente, ou são disjuntos dos itens já cobertos por `AUD-ALOG-01`
(A/B — CASE-004; C/F/G — CASE-014), para não duplicar remediação nem
contabilidade de finding (mesma disciplina já aplicada em CASE-009 §1 e
CASE-013 §4 deste programa). Não decidir escopo por conta própria sem
declarar a sobreposição encontrada.
DEPENDENCIES: nenhuma dependência conhecida com T-49/T-50 (este finding não
envolve `T41-EST-F01`, `T41-RH-F02` nem `T49-RH-C01`/`AUD-RH-VALIDADENULA-01`
— domínios distintos). Verificar sobreposição com `AUD-ALOG-01` (ver
RECOMMENDATION acima) e com o padrão `logAction` já instalado por CASE-004
(`employeeController.ts`, `itemController.ts` — item A/B) e CASE-014
(`itemController.ts` item C, `categoryController.ts`, `departmentController.ts`).
RETEST_SPECIFICATION: mesma disciplina já fixada para `AUD-ALOG-01`: reteste
exige que o registro identifique **USER e origem** — `logAction` sem `req`/autor
não fecha o finding (mesma exigência aplicada em CASE-004 §5).

---

## Autorização de abertura (fase TRIAGEM) — base registrada, não decisão nova

Esta abertura **não** decorre de decisão humana específica sobre
`AUD-T01-02` colhida nesta sessão — nenhuma foi solicitada nem tomada. A base
para abrir a fase de TRIAGEM (não a execução) é a mesma já usada para os casos
CASE-006, CASE-009, CASE-010 e CASE-014 deste programa, nenhum dos quais tem
entrada própria de "abertura" em `APPROVALS.md`:

1. `T-39_FILA_REMEDIACAO_EXPOSICAO.md` §2.2 item 3 lista `AUD-T01-02` entre os
   "9 HIGH nominais" do estrato 2 (HIGH · produção real), imediatamente após
   `AUD-T01-01` (já em remediação — `CASE-017`).
2. `APR-2026-031` D-13 (`APPROVALS.md:1550-1567`) autoriza a aplicação da fila
   de exposição real na ordem declarada por `T-39`.
3. Nenhuma trava de `T-49`/`T-50` se aplica (domínio distinto — ver
   DEPENDENCIES acima).
4. Nenhuma pendência de Regra 22 bloqueia este finding: é HIGH, `CONFIRMED`
   pela VeriCore (`T-01` §3), sem indicação de reavaliação pendente.

**O que esta abertura NÃO autoriza:** execução de remediação, escolha de
desenho de correção, ou qualquer decisão de negócio. Compete à
`sanacore-remediation-triage` produzir o `TRIAGE.md` (causa-raiz, blast
radius, plano, perguntas ao dono se houver) e ao `coretriad-director`
encaminhar ao dono qualquer decisão que a triagem revelar como necessária —
exatamente o fluxo já seguido nos casos citados acima.

**Escopo desta abertura:** exclusivamente `AUD-T01-02`. Não amplia por
analogia a `T33-A-F04` (também no mesmo estrato, ainda sem caso aberto,
explicitamente declarado fora de escopo por `CASE-004` §8 item 8) nem a
nenhum outro item da fila.

**Nada aqui declara causa-raiz, plano de correção, `RETEST_PASSED`,
`FINDING CLOSED` ou aceitação de risco.** Autoridade de fechamento permanece
exclusiva da VeriCore (Regras 3 e 4 do `CLAUDE.md`).

**Registrado por:** `coretriad-director` — 2026-08-20.
