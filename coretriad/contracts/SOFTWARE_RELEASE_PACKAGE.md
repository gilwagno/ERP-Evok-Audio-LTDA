# SOFTWARE_RELEASE_PACKAGE  (OpusCore → VeriCore)
# v2 — decomposição em subunidades + julgamento cego (Gauntlet Loop, Master Spec §22.1/§22.2)
PROJECT_ID:
RELEASE_ID:
VERSION:
COMMIT_HASH:          # vira AUDIT_COMMIT (congelado)
SOURCE_BRANCH:
ROUND_NUMBER:         # 1 na primeira submissão; incrementa a cada reprovação de subunidade (teto: 5, Master Spec §22.4)

SUBUNIT_MANIFEST:     # lista de subunidades verificáveis para a auditoria decompor (módulo | critério de aceitação | caso de teste), cada linha com os artefatos/arquivos associados — base do teto de 6 agentes simultâneos (§22.1)

## PARTE A — ARTEFATO
# VeriCore avalia esta parte primeiro, subunidade por subunidade, sem ler a Parte B (julgamento cego, §22.2)

PRODUCT_SPECIFICATION:
BUSINESS_PROCESS:
BUSINESS_RULES:
REQUIREMENTS:
NFRS:
USE_CASES:
ACCEPTANCE_CRITERIA:

ARCHITECTURE:
ADRS:
API_CONTRACTS:
DATA_MODEL:
MIGRATIONS:

SECURITY_REQUIREMENTS:
THREAT_MODEL:
AUTHORIZATION_MATRIX:

TEST_STRATEGY:
TEST_RESULTS:
EXECUTABLE_VERIFICATION_HOOKS:  # como o auditor executa de fato o artefato (comando de sandbox, ambiente de teste, script de chamada de API, roteiro de browser automation) — §22.3. Se não houver hook executável para algum item, declarar aqui explicitamente.

DEPLOYMENT_PLAN:
ROLLBACK_PLAN:
DOCUMENTATION_INDEX:

## PARTE B — JUSTIFICATIVA (OpusCore)
# VeriCore só lê esta parte depois de emitir o veredito preliminar de Nível 1/2 por subunidade na Parte A (§22.2, §22.4)

IMPLEMENTATION_RATIONALE:  # por que as decisões técnicas foram tomadas assim
KNOWN_LIMITATIONS:
KNOWN_RISKS:
