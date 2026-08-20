# VEREDITO DE RETESTE — `ERP-LEGACY-001-CASE-004` / `AUD-ALOG-01` itens A e B

```
EMITIDO POR        vericore-software-audit-director (VeriCore)
DATA               2026-08-20
FINDING            AUD-ALOG-01 — item A (CRITICAL, produção real) e item B (HIGH, produção real)
ESCOPO DESTE ATO   APENAS itens A e B. Itens C-H e o parcial de `sales` NÃO são objeto
                   deste veredito e permanecem CONFIRMED/abertos, inalterados.
CASO               ERP-LEGACY-001-CASE-004
AUDIT_COMMIT       c1311a6f76b512fef893f7e60d934179cae3409f   (imutável, Regras 12-14)
WORKTREE RETESTADO C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004
BRANCH             sana/ERP-LEGACY-001/CASE-004
HEAD               2c10a80
REMEDIATION_COMMITS estágio 1 (item A): fe60f9114b0ab76a1c0e9f18369c1ae4f614026b
                    estágio 2 (item B): a44f25bfbe2d0506ff53f5a553d3403fb675c05c
BASE NORMATIVA     APR-2026-033 (abertura do caso) · APR-2026-034 D1 (OR-21, Rota 2)
CRITÉRIO ORIGINAL  audit/runs/ERP-LEGACY-001-AUD-001/07-findings/AUD-ALOG-01.md §7
```

```
VEREDITO ....................... NÃO É DECLARADO RETEST_PASSED NEM RETEST_FAILED
ESTADO REGISTRADO ............... RETEST_STATIC_PASSED / DYNAMIC_VERIFICATION_PENDING
                                   Itens A e B permanecem ABERTOS (não CLOSED)
```

**Nenhum `RETEST_PASSED`, `RETEST_FAILED` ou `FINDING CLOSED` é declarado para os itens A e
B por este ato.** A lacuna dinâmica declarada no despacho é, no meu juízo, **bloqueante**
para este caso específico — não por regra genérica, mas porque a linha de causa deste caso
é exatamente uma classe de falha que só se manifesta em tempo de execução contra banco real
(§3). Aprovar sem essa prova seria `READ → FIND → FIX`-adjacente ao inverso: declarar
veredito por inferência sobre evidência que o próprio critério de reteste do finding exige e
que ninguém, nem a SanaCore nem esta sessão, produziu (Master Spec §22.3).

---

## 1. Método seguido — julgamento cego antes de ler a narrativa da SanaCore

Ordem em que a evidência foi avaliada, nesta sequência, para não ancorar em narrativa (Master
Spec §22.2):

1. Evidência de execução independente do `vericore-audit-verification-runner` desta sessão:
   typecheck limpo; 5 suítes-alvo 34/34; suíte completa do `server/` 1967/1968, única falha
   preexistente e alheia (`docs-path-reference-guard.test.ts`), com **contagem exata** igual à
   reportada pela SanaCore nos dois estágios — isto corrobora que a evidência da SanaCore não
   foi fabricada nem seletivamente relatada, mas não é, por si, prova de comportamento em
   banco real (as suítes usam dublês de `models/index`, `Repository` e `auditLogService` — ver
   §2).
2. Só então li `REMEDIATION_RESPONSE.md` (estágio 1) e `REMEDIATION_RESPONSE_ESTAGIO_2.md`
   (estágio 2), no worktree `sana/ERP-LEGACY-001/CASE-004`.
3. Li `APR-2026-033` e `APR-2026-034` (D1) em `coretriad/governance/APPROVALS.md` — ambas
   existem, cobrem o que foi feito, e a condição vinculante nelas registrada ("o registro deve
   identificar USER e origem — gravar a ação sem o autor não fecha") é textualmente idêntica à
   do finding.
4. Reli `AUD-ALOG-01.md` §7 no artefato principal, não por citação de terceiro.
5. Verifiquei, por leitura direta de código (não por citação da SanaCore), a alegação central
   do estágio 2 sobre nulabilidade de `entity_id` (§3 abaixo) — porque é uma afirmação sobre
   comportamento de banco, e afirmações sobre banco se verificam no schema, não na prosa.

## 2. O que a evidência estática e unitária JÁ estabelece — aceito, com fundamento

| Elemento do critério de reteste (finding §7 + `APR-2026-033`) | Estado | Como verifiquei |
|---|---|---|
| `logAction` presente nos call sites de A e B, `action: 'soft_delete'`, par `oldValues`/`newValues` | **Confirmado** | Suítes-alvo passando (34/34), reexecutadas nesta sessão de forma independente, não por leitura de diff |
| Registro identifica **USER e origem** (requisito específico de A/B, vinculante em `APR-2026-033`) | **Confirmado por método incomum e mais forte que equivalência** | Os testes asserem **identidade** (`toBe(req)`) entre o `req` da rota e o argumento repassado a `logAction`/`AuditLog.register`. Isto prova que nenhuma transformação, cópia parcial ou objeto sintético intercepta o `req` real antes de chegar ao ponto que extrai `user_id`/`user_name`/`user_ip`/`user_agent`/`route`/`method` (`AuditLog.ts:149-163`). É verificação estrutural do caminho de dados, e é aceita como suficiente **para a propriedade "o dado de autoria não é descartado no código"** |
| Regressão | **Nenhuma detectada** | 1967/1968 no `server/` completo, falha única preexistente e sem relação, confirmada duas vezes (estágio 1 e 2) com contagem idêntica |
| Payload mínimo / não vazamento de dado sensível | **Confirmado** | Testes varrem o payload serializado por chave e valor contra campos sensíveis nomeados |
| Nenhuma conexão de banco aberta nesta sessão nem nas evidências da SanaCore | **Confirmado, e correto** — `APR-2026-016` exige isso mesmo para reteste em ambiente não autorizado nesta sessão | Dublês em todas as suítes; nenhum `sequelize.authenticate`/`connect` alcançado |

**O que isto prova, com precisão:** que o código, tal como escrito, **não descarta** a
identidade do ator antes de tentar persistir, e que o formato do registro é o desenhado. **O
que isto NÃO prova:** que a persistência **acontece** contra o schema real sem ser engolida
pela degradação fire-and-forget de `auditLogService` — que é precisamente o modo de falha que
originou este caso (§3).

## 3. Por que a lacuna dinâmica é bloqueante especificamente aqui — não é exigência genérica

Este não é um caso onde exijo prova dinâmica por princípio. É bloqueante porque **a própria
causa-raiz que o caso ataca é uma classe de falha silenciosa em tempo de execução**, e as
suítes que passaram usam dublês exatamente na camada onde essa classe de falha vive.

`REMEDIATION_RESPONSE_ESTAGIO_2.md` §2 ("a armadilha do UUID") descreve, em detalhe, que uma
correção ingênua produziria: `200` ao usuário, `INSERT` rejeitado pelo Postgres (`22P02`,
`Number('<uuid>')` = `NaN`), erro engolido pela degradação fire-and-forget, e trilha
inexistente — **"pior que o estado atual"**, nas palavras do próprio documento. A correção
escolhida (`entityId: undefined` → grava `NULL`) depende, para funcionar, de uma afirmação
sobre o schema real: que `audit_logs.entity_id` aceita `NULL`.

Verifiquei essa afirmação por leitura direta (não por citação da SanaCore):

- `server/src/models/AuditLog.ts:85`: `entity_id: { type: DataTypes.INTEGER, comment: '...' }`
  — **sem** `allowNull: false` (ao contrário de `action:81` e `entity_type:84`, que o têm
  explicitamente). Sequelize/Postgres tratam a ausência de `allowNull: false` como nulável.
- `server/migrations/20260731-000009-align-audit-log-optional-columns.cjs` — migration
  dedicada que executa `ALTER COLUMN ... DROP NOT NULL` em `entity_id` (entre outras), e que
  `APR-2026-034` D1 registra estar **dentro do conjunto de migrations congelado no baseline**.

**Isto reduz materialmente, mas não elimina, o risco.** A nulabilidade no schema é consistente
com o que o código faz. O que permanece não verificado — e não é verificável por leitura de
schema — é o comportamento **fim a fim, em execução real**: que o `INSERT` de fato é aceito
pelo Postgres com os valores produzidos (incluindo `entity_description` truncada e os dois
verbos HTTP de B distinguíveis na linha gravada), e que nenhuma outra camada (trigger, check
constraint não descoberto por mim, serialização de `JSON` em `old_values`/`new_values`)
rejeita silenciosamente a escrita. Suítes com dublê de `AuditLog.create` não podem, por
desenho, expor esse comportamento — é exatamente a lacuna que o critério `DYN-T03-07` do
finging existe para fechar.

**Nota (Regra 21):** não há contradição entre fontes aqui — SanaCore, a evidência estática e
eu concordamos que a prova dinâmica está pendente. A pergunta a decidir não era "quem tem
razão", era "essa lacuna bloqueia o veredito", e a resposta é sim, por fundamento próprio
declarado acima, não por deferência a nenhuma das partes.

## 4. Autorização de dado real — por que não executei a prova dinâmica agora

`APR-2026-033` autoriza reprodução e teste **apenas em banco com sufixo `_test`/`_ci`**
(`erp_evok_audio_test`), nunca produção. Isso autoriza a existência da prova, mas abrir uma
conexão de banco nesta sessão exigiria confirmação explícita que não foi dada — e a instrução
recebida para esta tarefa foi explícita em não presumir essa autorização. Não abri conexão
alguma. Isto é conservador por desenho, não omissão.

## 5. O que falta, exatamente, para fechar A e B — critério objetivo

Contra `erp_evok_audio_test` apenas, com usuário de teste autenticado (não anônimo):

1. **Item A** — `DELETE /api/employees/:id` sobre um funcionário de teste. Verificar: exatamente
   1 linha nova em `audit_logs`; `action='soft_delete'`; `entity_type='Employee'`; `entity_id`
   igual ao id numérico do funcionário (não `NULL`, não erro de inserção); `user_id`/`user_name`/
   `user_ip`/`route`/`method` populados e coerentes com o usuário de teste que executou a
   chamada; `old_values`/`new_values` contendo exatamente `status` e `dismissal_date`.
2. **Item B** — as duas rotas, cada uma isoladamente, sobre um item de teste: `PATCH
   /api/items/:id/inactivate` e `DELETE /api/items/:id`. Para cada uma: 1 linha nova recuperável
   por `entity_type='Item'` + `entity_description` (não por `entity_id`, que é `NULL` por
   desenho — `AUD-DB-04` permanece aberto); `route`/`method` distinguindo as duas chamadas;
   `user_id`/`user_name` populados; `old_values`/`new_values` contendo exatamente `item_id`,
   `codigo`, `status`; `entity_description` presente e não truncado de forma a perder as duas
   chaves de recuperação (`codigo` + UUID).
3. Confirmar, nas duas execuções, **ausência** de entrada nova em `logs/audit-failures.log` —
   para excluir degradação silenciosa mascarando falha como sucesso aparente.
4. Isto é a fatia de `DYN-T03-07` aplicável a estes 2 (de 14) call sites — não substitui nem
   antecipa a execução completa do critério dinâmico do finding inteiro.

Quando essa evidência existir, registrada em `audit/runs/ERP-LEGACY-001-AUD-001/30-retest/`
(ou anexo a este veredito), este director profere o veredito final de A e B sobre ela.

## 6. Limites deste ato — o que ele NÃO faz

1. **Não declara `RETEST_PASSED`** para os itens A ou B.
2. **Não declara `RETEST_FAILED`** — não há evidência de defeito remanescente; a lacuna é de
   prova, não de achado contrário.
3. **Não declara `FINDING CLOSED`**, nem parcial nem total. `AUD-ALOG-01` permanece `CONFIRMED`
   e aberto para A e B, e **integralmente aberto e intocado** para os itens C-H e o parcial de
   `sales` — este ato não se pronuncia sobre eles.
4. **Não declara `REMEDIATION COMPLETE`** — é a nomenclatura que a SanaCore já usou, e este ato
   não a ratifica nem a contesta; apenas não é minha autoridade (Regra 3).
5. **Não altera `AUD-DB-04`** (MEDIUM, aberto) — o contorno de `entityId` (`OR-21`, Rota 2)
   permanece contorno declarado, não correção de causa-raiz, exatamente como a SanaCore
   registrou.
6. **Não corrige, refatora nem toca o objeto auditado.** Nenhuma escrita fora deste arquivo.
7. **Não abre conexão de banco.**

## 7. Registro formal e encaminhamentos

```
AUD-ALOG-01/A   severidade CRITICAL   (inalterada)   estado: CONFIRMED, ABERTO
AUD-ALOG-01/B   severidade HIGH       (inalterada)   estado: CONFIRMED, ABERTO
                estado de reteste: RETEST_STATIC_PASSED / DYNAMIC_VERIFICATION_PENDING
                NÃO É RETEST_PASSED · NÃO É RETEST_FAILED · NÃO É FINDING CLOSED

Itens C-H e parcial de `sales`: fora deste ato, inalterados, CONFIRMED/abertos.

Autoridade: vericore-software-audit-director, Regra 4.
Escrita: exclusivamente este arquivo, em audit/runs/.
         Nenhum artefato histórico alterado (Regra 15).
         Nada em remediation/, src/, server/, client/, tests/, coretriad/ (Regra 2).
```

1. **Ao dono (humano):** decidir se autoriza, em sessão própria, a execução de `DYN-T03-07`
   (subconjunto A/B) contra `erp_evok_audio_test`, com as 2 rotas e os campos do §5. Sem essa
   autorização e execução, A e B permanecem no estado aqui registrado indefinidamente.
2. **À VeriCore (execução futura, quando autorizada):** produzir a coleta dinâmica do §5 e
   trazer a este director para veredito final de A e B. Usar `vericore-audit-evidence-controller`
   para persistir a coleta em `audit/`.
3. **À SanaCore:** nenhuma ação nova — a entrega de A e B está tecnicamente completa quanto ao
   que é verificável sem banco. Não é pedido reabrir código.
4. **Ao CoreTriad Director / registro do run:** este veredito não altera `AUDIT_VERDICT.md`
   (`AUDIT_PASSED`, 2026-08-17), que já lista corretamente o reteste de `CASE-004` como
   pendente (§5.1, §5.4, §10). Nenhuma correção é necessária lá em razão deste ato.

## 8. Divergências encontradas entre fontes

Nenhuma divergência material de fato entre as fontes examinadas. Registro apenas:

- `REMEDIATION_RESPONSE.md` (estágio 1) §7 documenta uma divergência histórica interna sobre a
  existência de `APR-2026-034` no momento em que foi escrito — divergência **já resolvida**
  pela própria linha do tempo (a aprovação foi registrada em 2026-08-17 e o estágio 2 a cita
  corretamente); não é uma divergência viva e não exige ação minha.
- Nenhuma das três fontes (execução independente desta sessão, documentos da SanaCore,
  aprovações) contradiz outra quanto ao estado técnico. A única lacuna é a ausência comum e
  reconhecida da prova dinâmica.
```
