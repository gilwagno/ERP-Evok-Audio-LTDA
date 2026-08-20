# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)
# v2 — julgamento cego + verificação por execução real (Gauntlet Loop, Master Spec §22.2/§22.3)
CASE_ID:
FINDING_ID:
ROUND_NUMBER:         # v1 na primeira remediação; incrementa a cada RETEST_FAILED (teto: 5 por finding/subunidade, Master Spec §22.4) — ao atingir o teto, escala para revisão humana em vez de repetir

## PARTE A — EVIDÊNCIA VERIFICÁVEL
# VeriCore reproduz o finding e executa esta parte primeiro, sem ler a Parte B (julgamento cego, §22.2)

FILES_CHANGED:
TESTS_ADDED:
TESTS_CHANGED:
TEST_RESULTS:
EXECUTABLE_RETEST_INSTRUCTIONS:  # como reproduzir e executar de fato o reteste (não apenas ler o diff) — §22.3. Se não houver como executar (ferramenta ausente), declarar a limitação explicitamente em vez de aprovar sem testar.
RETEST_INSTRUCTIONS:             # roteiro complementar de reteste (passos manuais/humanos, se houver, além do executável acima)
COMMIT_HASH:            # REMEDIATION_COMMIT (não substitui AUDIT_COMMIT)
BRANCH:                 # sana/<PROJECT>/<FINDING>

## PARTE B — JUSTIFICATIVA (SanaCore)
# VeriCore só lê esta parte depois de reproduzir o finding original e confirmar (ou não) que deixou de ocorrer (§22.2, §30)

ROOT_CAUSE:
LOCAL_FIX:
SYSTEMIC_FIX_REQUIRED:
BLAST_RADIUS:
CORRECTION_STRATEGY:
REGRESSION_ANALYSIS:
ARCHITECTURE_IMPACT:
DATABASE_IMPACT:
API_IMPACT:
SECURITY_CHECKS:
DOCUMENTATION_UPDATED:
RESIDUAL_RISK:
