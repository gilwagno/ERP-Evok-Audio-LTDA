# REMEDIATION_EVIDENCE_PACKAGE  (SanaCore → VeriCore)
CASE_ID: SIM-001-CASE-002
FINDING_ID: FIND-SIM-001-002

ROOT_CAUSE:
Causa dupla e correlacionada:
1. A constante `LATE_CANCEL_FEE_RATE` em
   `product/SIM-001/src/bookingService.js` L16 estava hardcoded em `0.20`,
   divergindo de BR-SIM-002 (`product/SIM-001/requirements/BUSINESS_RULES.md`
   L9-13), que documenta explicitamente taxa de 10% para cancelamento com
   menos de 24h de antecedência. Nenhum ADR, changelog ou registro versionado
   autorizava o desvio de 10% para 20%.
2. O teste TC-SIM-002b (`product/SIM-001/tests/booking.test.js`, à época
   L112-132) havia sido calibrado sobre o comportamento observado do código
   (`assert.equal(result.fee, 40)`) em vez de validar contra a regra de
   negócio — neutralizando a suíte como mecanismo de detecção da divergência.
A BR versionada é a fonte autoritativa (Regras 7 e 21 do CLAUDE.md); na
ausência de qualquer registro formal justificando 20%, o valor correto é 10%.

LOCAL_FIX:
- `bookingService.js` L16: `LATE_CANCEL_FEE_RATE` alterado de `0.20` para
  `0.10`, com comentário referenciando BR-SIM-002 explicitamente.
- `booking.test.js`: TC-SIM-002b reescrito para assertar `fee === 20` sobre
  `price: 200` (10% correto), citando "10%" e "BR-SIM-002" no título do
  teste.
- `booking.test.js`: novo teste de fronteira TC-SIM-002d adicionado,
  cobrindo cancelamento com exatamente 24h de antecedência (fee deve ser 0),
  conforme item (b) da RETEST_SPECIFICATION do caso.

SYSTEMIC_FIX_REQUIRED: Não. A causa é local e isolada a uma única constante
em um único módulo (`bookingService.js`), sem replicação em outros pontos do
código. Grep por `LATE_CANCEL_FEE_RATE`, `0.20`/`0.2` e por padrões
equivalentes de taxa de cancelamento no restante do repositório SIM-001 não
retornou outras ocorrências do valor incorreto. O caso é registrado no
handoff (`coretriad/handoffs/SIM-001/REMEDIATION_CASE-SIM-001-CASE-002.md`,
campo DEPENDENCIES) como "causa-raiz independente dos demais findings do
ciclo SIM-001".

BLAST_RADIUS:
Limitado à função de cancelamento de reserva com cobrança de taxa
(`bookingService.js`, fluxo de cancelamento tardio). Não afeta criação de
reserva, listagem, autorização de cancelamento (BR-SIM-001) ou verificação
de sobreposição (BR-SIM-003) — esses fluxos são cobertos por testes
distintos (TC-SIM-001, TC-SIM-001b, TC-SIM-004, TC-SIM-003*) que permanecem
inalterados e verdes.

CORRECTION_STRATEGY:
Alinhar o código à regra de negócio versionada (fonte autoritativa),
corrigindo tanto a constante quanto o teste que a validava incorretamente,
e adicionar cobertura de fronteira ausente (exatamente 24h) para fechar a
lacuna que permitiu a divergência original passar despercebida pela suíte.

FILES_CHANGED:
- product/SIM-001/src/bookingService.js (1 linha alterada + 1 comentário)
- product/SIM-001/tests/booking.test.js (TC-SIM-002b reescrito; TC-SIM-002d
  adicionado)

TESTS_ADDED:
- TC-SIM-002d — "cancelamento com exatamente 24h de antecedencia nao cobra
  taxa" (cobre a fronteira exata do intervalo de 24h de BR-SIM-002).

TESTS_CHANGED:
- TC-SIM-002b — antes assertava `fee === 40` (comportamento incorreto do
  código, 20%); agora assertava `fee === 20` sobre `price: 200` (10%
  correto), com título citando explicitamente "taxa de 10% (BR-SIM-002)".

TEST_RESULTS:
Suíte completa reexecutada nesta evidência em
`0e76a1c834ef627bf28aecabd879b346bff0328f`
(`node --test "product/SIM-001/tests/booking.test.js"`):

```
✔ TC-SIM-001: cria reserva valida com id unico e status active
✔ TC-SIM-001b: rejeita reserva com start >= end
✔ TC-SIM-004: lista apenas reservas ativas da sala consultada
✔ TC-SIM-002: cancelamento com 24h ou mais de antecedencia nao cobra taxa
✔ TC-SIM-002b: cancelamento com menos de 24h de antecedencia cobra taxa de 10% (BR-SIM-002)
✔ TC-SIM-002d: cancelamento com exatamente 24h de antecedencia nao cobra taxa
✔ TC-SIM-002c: nao permite cancelar reserva ja cancelada

tests 7
pass 7
fail 0
cancelled 0
skipped 0
todo 0
```

7/7 verde. Nenhum teste falhou; nenhuma evidência desfavorável foi
identificada nesta reexecução.

REGRESSION_ANALYSIS:
Risco baixo. A mudança é uma alteração de valor de constante numérica
(`0.20` → `0.10`) em um único ponto de uso, sem alteração de lógica de
controle, assinatura de função ou contrato de API. Os demais casos de teste
da suíte (criação de reserva, validação de intervalo, listagem, cancelamento
sem taxa, cancelamento duplicado) permanecem inalterados e verdes,
confirmando ausência de efeito colateral sobre os demais fluxos de
`bookingService.js`. REGRESSION_RISK: BAIXO.

ARCHITECTURE_IMPACT: Nenhum. Não há alteração de estrutura de módulos,
camadas ou contratos entre componentes.
DATABASE_IMPACT: Nenhum. SIM-001 não persiste em banco de dados (estrutura
in-memory do simulado); nenhum schema, migration ou dado afetado.
API_IMPACT: Nenhum. Nenhuma assinatura de função pública, rota ou payload
foi alterada — apenas o valor numérico interno usado no cálculo de `fee`.
SECURITY_CHECKS: Não aplicável a este finding (TECHNICAL_IMPACT e
BUSINESS_IMPACT do caso são de natureza funcional/financeira; SECURITY_IMPACT
registrado como "—" no handoff original).
DOCUMENTATION_UPDATED:
`product/SIM-001/requirements/BUSINESS_RULES.md` (BR-SIM-002, L9-13) já
documentava corretamente a taxa de 10% antes desta remediação — não houve
necessidade de alteração na documentação de regras de negócio. Confirmado
por leitura direta do arquivo nesta evidência: nenhuma mudança foi commitada
em `BUSINESS_RULES.md` no commit de remediação (`git show 0e76a1c --stat`
lista apenas `bookingService.js` e `booking.test.js`).

COMMIT_HASH: 0e76a1c834ef627bf28aecabd879b346bff0328f
BRANCH: sana/SIM-001/FIND-002
RESIDUAL_RISK:
Nenhum risco residual identificado dentro do escopo deste finding. A
constante corrigida e os testes (incluindo o novo teste de fronteira)
cobrem os três cenários da RETEST_SPECIFICATION do caso (fee=20 para <24h,
fee=0 para exatamente 24h, fee=0 para >24h via TC-SIM-002 já existente).
Recomenda-se que a VeriCore, no reteste, também verifique a ausência de
outras ocorrências divergentes de taxa no repositório (grep independente),
já que a confirmação de "causa isolada" nesta evidência foi feita pela
SanaCore e deve ser reproduzida de forma independente.

RETEST_INSTRUCTIONS:
1. Fazer checkout do commit `0e76a1c834ef627bf28aecabd879b346bff0328f` (branch
   `sana/SIM-001/FIND-002`) — este é o REMEDIATION_COMMIT, não o AUDIT_COMMIT
   original (`b736a1e733f802735b1b79348e3c6cc084bd466e`); reteste avalia o
   estado pós-correção.
2. Reproduzir o cenário original do finding: criar reserva com `price: 200`,
   cancelar com menos de 24h de antecedência do início; verificar
   `result.fee === 20` (era 40 antes da correção).
3. Verificar item (b) da RETEST_SPECIFICATION: cancelamento com exatamente
   24h de antecedência → `fee === 0`.
4. Verificar item (c): cancelamento com mais de 24h de antecedência →
   `fee === 0` (já coberto por TC-SIM-002, inalterado).
5. Ler `product/SIM-001/tests/booking.test.js` TC-SIM-002b e confirmar que o
   teste cita explicitamente "10%" e "BR-SIM-002", e não mais assevera o
   valor incorreto anterior (40).
6. Executar a suíte completa: `node --test "product/SIM-001/tests/booking.test.js"`
   e confirmar 7/7 verde de forma independente.
7. Grep por `LATE_CANCEL_FEE_RATE` e por valores `0.20`/`0.2` relacionados a
   taxa de cancelamento no restante do repositório SIM-001, para confirmar
   independentemente a afirmação de causa isolada (SYSTEMIC_FIX_REQUIRED:
   não) feita nesta evidência.
8. Confirmar que `BUSINESS_RULES.md` (BR-SIM-002) permanece inalterado e
   consistente com o comportamento corrigido do código.

Esta evidência não declara `RETEST_PASSED` nem `FINDING CLOSED` — essas
declarações são exclusivas da VeriCore (Regras 3 e 4 do CLAUDE.md).

STATUS: REMEDIATION_COMPLETE / READY_FOR_RETEST
