# VEREDITO DE RETESTE — `ERP-LEGACY-001-CASE-004` / `AUD-ALOG-01` itens A e B

```
EMITIDO POR        vericore-software-audit-director (VeriCore)
DATA               2026-08-20 (rodada 1) — ATUALIZADO 2026-08-20 (rodada 2, mesmo ato)
                   — ATUALIZADO 2026-08-20 (rodada 3, mesmo ato)
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
EVIDÊNCIA ADMITIDA audit/runs/ERP-LEGACY-001-AUD-001/30-retest/DYN-T03-07_EVIDENCIA.md
                   (persistida por vericore-audit-evidence-controller — ver §10)
```

```
VEREDITO FINAL (itens A e B) ....... RETEST_PASSED
FINDING CLOSED (itens A e B, apenas) SIM — ver §10.5 para o alcance exato
ITENS C-H E PARCIAL DE `sales` ..... INALTERADOS — CONFIRMED, abertos
AUD-DB-04 (MEDIUM) ................. INALTERADO — aberto (contorno declarado, não correção)
```

**A partir desta rodada 3, e apenas para os itens A e B de `AUD-ALOG-01`, este director
declara `RETEST_PASSED` e `FINDING CLOSED`**, com base em artefato persistido sob custódia de
VeriCore que satisfaz o critério objetivo fixado por este mesmo director nas rodadas
anteriores (§5, §9.4). As rodadas 1 e 2 abaixo (§1-9) permanecem **inalteradas como histórico
de decisão** (Regra 15) — o veredito final está em §10.

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
finding existe para fechar.

**Nota (Regra 21):** não há contradição entre fontes aqui — SanaCore, a evidência estática e
eu concordamos que a prova dinâmica está pendente (na rodada 1). A pergunta a decidir não era
"quem tem razão", era "essa lacuna bloqueia o veredito", e a resposta foi sim, por fundamento
próprio declarado acima, não por deferência a nenhuma das partes.

## 4. Autorização de dado real — por que não executei a prova dinâmica na rodada 1

`APR-2026-033` autoriza reprodução e teste **apenas em banco com sufixo `_test`/`_ci`**
(`erp_evok_audio_test`), nunca produção. Isso autoriza a existência da prova, mas abrir uma
conexão de banco na rodada 1 exigiria confirmação explícita que não foi dada — e a instrução
recebida para aquela tarefa foi explícita em não presumir essa autorização. Não abri conexão
alguma naquela rodada. Isto foi conservador por desenho, não omissão.

## 5. Critério objetivo fixado na rodada 1 para fechar A e B — mantido como padrão de admissão

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

Este critério permanece o padrão de admissão vigente. A rodada 2 (§9) avalia contra ele —
não contra um padrão novo.

## 6. Limites deste ato — o que ele NÃO faz

1. **Não declara `RETEST_PASSED`** para os itens A ou B.
2. **Não declara `RETEST_FAILED`** — não há evidência de defeito remanescente; a lacuna, em
   ambas as rodadas, é de prova admissível, não de achado contrário.
3. **Não declara `FINDING CLOSED`**, nem parcial nem total. `AUD-ALOG-01` permanece `CONFIRMED`
   e aberto para A e B, e **integralmente aberto e intocado** para os itens C-H e o parcial de
   `sales` — este ato não se pronuncia sobre eles.
4. **Não declara `REMEDIATION COMPLETE`** — é a nomenclatura que a SanaCore já usou, e este ato
   não a ratifica nem a contesta; apenas não é minha autoridade (Regra 3).
5. **Não altera `AUD-DB-04`** (MEDIUM, aberto) — o contorno de `entityId` (`OR-21`, Rota 2)
   permanece contorno declarado, não correção de causa-raiz, exatamente como a SanaCore
   registrou, e exatamente como a rodada 2 confirma abaixo (§9.2).
6. **Não corrige, refatora nem toca o objeto auditado.** Nenhuma escrita fora deste arquivo.
7. **Não abre conexão de banco.**

(Nota da rodada 3: os itens 1-3 acima descreviam corretamente o estado *daquele ato*, na
rodada 1/2. Não foram reescritos — Regra 15 — e permanecem válidos como registro histórico do
que foi e não foi decidido naquele momento. O veredito final está em §10, não aqui.)

## 7. Registro formal e encaminhamentos

```
AUD-ALOG-01/A   severidade CRITICAL   (inalterada)   estado: CONFIRMED, ABERTO
AUD-ALOG-01/B   severidade HIGH       (inalterada)   estado: CONFIRMED, ABERTO
                estado de reteste: RETEST_STATIC_PASSED / DYNAMIC_EVIDENCE_REPORTED_NOT_ADMISSIBLE
                NÃO É RETEST_PASSED · NÃO É RETEST_FAILED · NÃO É FINDING CLOSED

Itens C-H e parcial de `sales`: fora deste ato, inalterados, CONFIRMED/abertos.

Autoridade: vericore-software-audit-director, Regra 4.
Escrita: exclusivamente este arquivo, em audit/runs/.
         Nenhum artefato histórico alterado (Regra 15).
         Nada em remediation/, src/, server/, client/, tests/, coretriad/ (Regra 2).
```

1. **Ao dono (humano):** decidir se autoriza, em sessão própria, a persistência formal do
   artefato bruto do `DYN-T03-07` (subconjunto A/B) — ver §9.4 para a lista exata do que falta
   persistir. Sem isso, A e B permanecem no estado aqui registrado indefinidamente.
2. **À VeriCore (`vericore-audit-evidence-controller`):** persistir em `audit/`, sob custódia
   própria, o artefato bruto da execução já relatada (não apenas o resumo em prosa) — ver §9.4.
   Só então este director profere o veredito final de A e B sobre ele.
3. **À SanaCore:** nenhuma ação de código nova — a entrega de A e B está tecnicamente completa
   quanto ao que é verificável sem banco, e a execução dinâmica relatada em §9 é consistente
   com essa entrega. O que falta não é trabalho de correção; é persistência de evidência sob
   custódia de VeriCore.
4. **Ao CoreTriad Director / registro do run:** este veredito não altera `AUDIT_VERDICT.md`
   (`AUDIT_PASSED`, 2026-08-17), que já lista corretamente o reteste de `CASE-004` como
   pendente (§5.1, §5.4, §10). Nenhuma correção é necessária lá em razão deste ato.

(Nota da rodada 3: os encaminhamentos (1) e (2) foram cumpridos — ver §10. O item 4 é
reavaliado em §10.6.)

## 8. Divergências encontradas entre fontes

Nenhuma divergência material de fato entre as fontes examinadas. Registro apenas:

- `REMEDIATION_RESPONSE.md` (estágio 1) §7 documenta uma divergência histórica interna sobre a
  existência de `APR-2026-034` no momento em que foi escrito — divergência **já resolvida**
  pela própria linha do tempo (a aprovação foi registrada em 2026-08-17 e o estágio 2 a cita
  corretamente); não é uma divergência viva e não exige ação minha.
- Nenhuma das três fontes (execução independente desta sessão, documentos da SanaCore,
  aprovações) contradiz outra quanto ao estado técnico. A única lacuna, na rodada 1, era a
  ausência comum e reconhecida da prova dinâmica.

## 9. Rodada 2 — avaliação da execução dinâmica relatada (2026-08-20)

### 9.1 O que foi recebido e por que não é, por si, o artefato exigido pelo §5

Recebi uma descrição de execução atribuída a um `vericore-audit-verification-runner`: servidor
de teste isolado (porta 3101), `erp_evok_audio_test`, login real via JWT, as três chamadas
(`DELETE /api/employees/1`, `PATCH /api/items/<uuid>/inactivate`, `DELETE /api/items/<uuid>`)
e um resumo do que cada uma produziu em `audit_logs`.

Antes de julgar o conteúdo, apliquei a mesma disciplina da rodada 1 (§1, §22.2 da Master
Spec): **narrativa de execução, por si, não é o artefato.** Busquei nesta sessão, neste
repositório e no worktree `sana/ERP-LEGACY-001/CASE-004`, qualquer arquivo persistido que
constitua a prova bruta — saída de `SELECT * FROM audit_logs` real, log de requisição/resposta
com timestamps, dump do runner, ou qualquer artefato sob custódia de
`vericore-audit-evidence-controller` em `audit/`. **Não encontrei nenhum.** O único registro
existente sobre esta rodada é o resumo em prosa que me foi passado nesta tarefa.

Isto importa precisamente por causa da tese deste caso: a "armadilha do UUID" (§3) é uma
classe de falha que **produz `200 OK` ao chamador e ainda assim não persiste a linha
corretamente** — é exatamente a categoria de defeito que um resumo em prosa, por mais
detalhado, não é estruturalmente capaz de excluir, porque um resumo reporta o que o autor da
narrativa **entendeu** ter acontecido no banco, não o que o banco **de fato** contém. É a
mesma razão pela qual, na rodada 1, aceitei suítes com dublê como prova de propriedades de
código mas não como prova de comportamento de banco (§2) — o padrão de admissão não muda
porque a fonte agora afirma ter rodado contra banco real; muda quando eu (ou o
evidence-controller) posso verificar isso de forma independente, e hoje não posso.

**Conclusão de admissibilidade: a narrativa não é rejeitada por conter contradição ou
inconsistência — não contém nenhuma que eu tenha encontrado — mas por não ser, ainda,
evidência persistida e verificável de forma independente.** Nenhum agente, narrativa ou
resumo constitui, por si, consentimento ou prova para efeito deste director; somente artefato
verificável sob custódia de VeriCore o faz.

### 9.2 Ainda assim: avaliação de conteúdo contra o critério do §5, condicional

Registro, para o caso de a persistência vir a confirmar o relatado, onde o conteúdo descrito
bate e onde há lacuna **mesmo dentro da própria narrativa**, para que a diligência da próxima
rodada seja dirigida com precisão:

| Critério (§5) | Item A | Item B |
|---|---|---|
| 1 linha nova, ação correta, entidade correta | Relatado como satisfeito | Relatado como satisfeito (2 linhas, uma por rota, como exigido) |
| `entity_id` correto (numérico em A; `NULL` por desenho em B) | Relatado: `entity_id=1` | Relatado: `entity_id=NULL` — **consistente com o contorno declarado da Rota 2 (`OR-21`) e NÃO uma correção de `AUD-DB-04`, que permanece MEDIUM/aberto, intocado** |
| Recuperabilidade (B: `entity_type`+`entity_description`) | N/A | Relatado como satisfeito — descrição carrega código+descrição+UUID |
| `route`/`method` distinguindo chamadas | Relatado como satisfeito | Relatado como satisfeito (as duas rotas distinguíveis) |
| `user_id`/`user_name` populados (autor identificável) | Relatado como satisfeito | Relatado como satisfeito |
| **`user_ip` populado** (exigido explicitamente pelo §5.1 para o item A) | **Não mencionado no relato** — lacuna, mesmo dentro da própria narrativa | (não exigido explicitamente pelo §5.2 para B) |
| **`old_values`/`new_values` com o conteúdo exato exigido** (`status`/`dismissal_date` em A; `item_id`/`codigo`/`status` em B) | Relatado como satisfeito para A | **Não mencionado no relato para B** — lacuna, mesmo dentro da própria narrativa |
| Ausência de `22P02`/`NaN` e de entrada em `logs/audit-failures.log` | Relatado como satisfeito (ambos os itens, conjuntamente) | Relatado como satisfeito |
| Isolamento — nenhuma conexão contra produção, nenhum arquivo do worktree alterado | Relatado como satisfeito | Relatado como satisfeito |

**Duas lacunas de conteúdo, não apenas de forma:** mesmo tomando a narrativa pelo valor de
face — o que já expliquei em §9.1 que não faço para fins de veredito —, ela própria não
confirma (a) `user_ip` para o item A, e (b) o conteúdo de `old_values`/`new_values` para o
item B. Isto não é prova de defeito; é ausência de informação no relato, que a persistência
do artefato bruto resolveria trivialmente se de fato estiver presente na linha gravada.

### 9.3 Por que isto não é `RETEST_FAILED`

Nada no relatado, nem na leitura de código feita na rodada 1, indica comportamento contrário
ao esperado. As duas lacunas de §9.2 são lacunas de relato, não evidência de falha — não há
aqui um achado que contradiga a correção, apenas ausência de confirmação de dois campos
específicos do meu próprio critério. `RETEST_FAILED` exigiria um achado adverso; não há um.

### 9.4 O que falta, exatamente, para fechar A e B — critério objetivo atualizado

1. **Persistência formal** do artefato bruto desta execução (ou de uma repetição dela) em
   `audit/`, sob custódia de `vericore-audit-evidence-controller` — no mínimo: saída literal de
   `SELECT` sobre as linhas novas de `audit_logs` (todas as colunas relevantes, não um resumo),
   timestamp da execução, identidade do usuário de teste autenticado, e confirmação de que a
   consulta foi feita contra `erp_evok_audio_test`.
2. **Item A:** confirmar `user_ip` populado e coerente com a origem da chamada de teste.
3. **Item B:** confirmar o conteúdo de `old_values`/`new_values` das duas linhas — exatamente
   `item_id`, `codigo`, `status` — para as duas rotas.
4. Com (1)-(3) satisfeitos e persistidos, este director profere o veredito final (`RETEST_PASSED`
   ou `RETEST_FAILED`) de A e B na mesma sessão de revisão, sem necessidade de nova rodada de
   execução além do que já foi relatado, **se** a persistência confirmar o que foi descrito.

### 9.5 Estado após a rodada 2

```
RETEST_PASSED ................. NÃO declarado
RETEST_FAILED .................. NÃO declarado
FINDING CLOSED ................. NÃO declarado
ESTADO .......................... RETEST_STATIC_PASSED / DYNAMIC_EVIDENCE_REPORTED_NOT_ADMISSIBLE
MOTIVO .......................... narrativa de execução recebida, tecnicamente coerente com o
                                   esperado e sem achado adverso, mas (a) não persistida como
                                   artefato verificável sob custódia de VeriCore, e (b) omissa,
                                   mesmo como narrativa, quanto a 2 dos elementos do critério
                                   próprio (§9.2) — user_ip (A) e old_values/new_values (B)
PRÓXIMA AÇÃO .................... vericore-audit-evidence-controller persiste o artefato bruto
                                   (§9.4); este director então conclui o veredito
```

## 10. Rodada 3 — artefato persistido recebido, avaliação final e veredito (2026-08-20)

### 10.1 Fonte lida na íntegra, como fonte primária

Li, na íntegra e diretamente (não por resumo de terceiro),
`audit/runs/ERP-LEGACY-001-AUD-001/30-retest/DYN-T03-07_EVIDENCIA.md`. É um artefato com
front-matter estruturado, custódia declarada por `vericore-audit-evidence-controller`,
depositado a partir de execução do `vericore-integration-retest-runner`, com nota de custódia
explícita ("depositado fielmente, sem edição de conteúdo técnico"; duas categorias de segredo
redigidas — senha de banco de teste, `JWT_SECRET`, webhook secret, token JWT — com marcação
explícita de cada redação, nunca silenciosa).

Isto **é** o artefato que faltava na rodada 2 (§9.4 item 1): não é mais prosa relatando o que
alguém entendeu ter acontecido no banco — é saída literal de comando (`psql -x`, sem
truncamento), com confirmação de banco-alvo ecoada antes de cada operação (Passos 1, 3, 7), e
persistida sob custódia de VeriCore, não do agente executor nem da SanaCore.

### 10.2 Verificação independente de uma alegação técnica central do artefato

O artefato explica o formato observado de `user_ip` (`::ffff:127.0.0.1`) por
`data.req?.ip` alimentar diretamente `user_ip` em `AuditLog.register`. Verifiquei por leitura
direta de código, não por aceitação da explicação do artefato:
`server/src/models/AuditLog.ts:164` — `user_ip: (data.req?.ip as string) ?? null,`. Confirma a
alegação: o campo é alimentado exatamente pelo `req.ip` real, sem transformação, e o valor
IPv4-mapped-IPv6 é o comportamento padrão do socket Node em `127.0.0.1` sem proxy — consistente
com `TRUST_PROXY=0` declarado no Passo 3. Nenhuma discrepância entre código e artefato.

### 10.3 Avaliação linha a linha contra o critério do §5 (finding §7 + `APR-2026-033`) e contra as duas lacunas específicas da rodada 2 (§9.4.2, §9.4.3)

As linhas desta rodada, identificadas pelo próprio artefato como tal (`created_at` 10:35:12,
`id`=6,7,8 — distintas das linhas residuais de uma execução anterior não persistida, `id`=4,5,
`created_at` 09:45:07, explicitamente rotuladas como não pertencentes a esta prova e não
tocadas, em conformidade com a Regra 15):

**Item A — `DELETE /api/employees/2` (linha `id=6`):**

| Critério (finding §7 / VERDICT §5.1) | Exigido | Observado no artefato | Veredito do elemento |
|---|---|---|---|
| 1 linha nova, `action='soft_delete'`, `entity_type='Employee'` | sim | `action=soft_delete`, `entity_type=Employee` | atende |
| `entity_id` numérico do funcionário, não `NULL`, sem erro de inserção | sim | `entity_id=2` | atende |
| `user_id`/`user_name` | populados, coerentes | `user_id=1`, `user_name=Administrador` | atende |
| `user_ip` (lacuna específica da rodada 2) | populado | `user_ip=::ffff:127.0.0.1` — verificado contra código em §10.2 | **lacuna da rodada 2 fechada** |
| `route`/`method` | populados, coerentes | `/api/employees/2`, `DELETE` | atende |
| `old_values`/`new_values` exatamente `status`+`dismissal_date` | sim | `old={"status":"active","dismissal_date":null}` / `new={"status":"inactive","dismissal_date":"2026-08-20"}` — nenhuma chave a mais ou a menos | atende |
| Ausência de `22P02`/`NaN`, resposta não-erro | sim | `200`, sem erro serializado (Passo 6) | atende |
| Ausência de entrada em `logs/audit-failures.log` | sim | arquivo ausente (Passo 10) | atende |

**Item A: todos os elementos do critério satisfeitos, incluindo a lacuna específica apontada
na rodada 2.**

**Item B — as duas rotas isoladamente (linhas `id=7` PATCH, `id=8` DELETE):**

| Critério (finding §7 / VERDICT §5.2) | Exigido | Observado no artefato | Veredito do elemento |
|---|---|---|---|
| 1 linha nova por rota, `action='soft_delete'`, `entity_type='Item'` | sim | ambas as linhas | atende |
| Recuperável por `entity_type`+`entity_description` (não `entity_id`, `NULL` por desenho — `AUD-DB-04` aberto) | sim | `entity_id` vazio/NULL nas duas; `entity_description` traz código+descrição+UUID íntegros nas duas | atende — e confirma que `AUD-DB-04` não é tocado, exatamente como exigido |
| `route`/`method` distinguindo as duas chamadas | sim | `PATCH .../inactivate` vs `DELETE /api/items/:id` puro — claramente distintos | atende |
| `user_id`/`user_name` | populados | `user_id=1`, `user_name=Administrador` nas duas | atende |
| `old_values`/`new_values` exatamente `item_id`, `codigo`, `status` (lacuna específica da rodada 2) | sim | ambas as linhas: exatamente essas 3 chaves, nenhuma a mais/menos, valores `ATIVO`→`INATIVO` coerentes | **lacuna da rodada 2 fechada, nas duas rotas** |
| `entity_description` presente, não truncado, preservando `codigo`+UUID | sim | confirmado nas duas linhas | atende |
| Ausência de `22P02`/`NaN` nas duas execuções | sim | `200`/`200`, sem erro serializado (Passo 6) | atende |
| Ausência de entrada em `logs/audit-failures.log` | sim | arquivo ausente (Passo 10) | atende |

**Item B: todos os elementos do critério satisfeitos nas duas rotas, incluindo as duas
lacunas específicas apontadas na rodada 2.**

**Isolamento (pré-condição transversal, `APR-2026-016`/`APR-2026-033`):** banco-alvo
`erp_evok_audio_test` confirmado e ecoado antes de cada operação de banco (Passos 1, 3, 7);
nenhuma referência a `erp_evok_audio` (produção) em nenhum comando; container `evok-api`
(produção-like, porta 5000) apenas observado, nunca acionado; nenhum arquivo versionado do
worktree criado/alterado (`git status --short` idêntico e vazio nos Passos 0 e 11); segredos
redigidos de forma marcada, não silenciosa, pela custódia de VeriCore. Nada aqui compromete a
admissibilidade do artefato.

**Transparência sobre resíduo de execução anterior não persistida (linhas `id=4,5`):**
declarada pelo próprio artefato, não removida nem alterada (Regra 15), e corretamente
excluída do julgamento desta rodada por não pertencer a ela. Não afeta o veredito.

### 10.4 Por que isto é suficiente para `RETEST_PASSED` — e não apenas mais uma rodada de "quase"

As duas rodadas anteriores não recusaram A/B por achado adverso — recusaram por lacuna de
prova (rodada 1: nenhuma execução dinâmica; rodada 2: execução relatada mas não persistida, e
omissa em 2 campos específicos mesmo como narrativa). Esta rodada 3 resolve exatamente essas
lacunas, sem introduzir achado contrário:

1. O artefato agora está **persistido sob custódia de VeriCore** (não é mais prosa de agente
   executor nem resumo de terceiro) — satisfaz §9.4.1.
2. `user_ip` do item A está **populado e verificado contra o código-fonte** (§10.2) — satisfaz
   §9.4.2.
3. `old_values`/`new_values` do item B estão **completos e com as chaves exatas exigidas**, nas
   duas rotas — satisfaz §9.4.3.
4. Nenhum elemento do critério original (finding §7, `APR-2026-033`) ficou sem confirmação.
5. Nenhuma inconsistência entre o artefato e a leitura direta de código foi encontrada (§10.2).

Não há, portanto, base para manter o veredito pendente: o padrão de admissão que este director
fixou nas rodadas 1 e 2 foi cumprido, e o conteúdo, avaliado quesito a quesito, não deixa
lacuna.

### 10.5 Veredito

```
AUD-ALOG-01/A   severidade CRITICAL (histórica, mantida no registro do finding)
                RETEST_PASSED
                FINDING CLOSED — restrito ao item A (DELETE /api/employees/:id)

AUD-ALOG-01/B   severidade HIGH (histórica, mantida no registro do finding)
                RETEST_PASSED
                FINDING CLOSED — restrito ao item B, nas duas rotas
                (PATCH /api/items/:id/inactivate e DELETE /api/items/:id)

Base do fechamento: DYN-T03-07_EVIDENCIA.md, linhas audit_logs id=6 (A), id=7 e id=8 (B),
persistidas sob custódia de vericore-audit-evidence-controller, contra erp_evok_audio_test,
avaliadas quesito a quesito em §10.3 acima.
```

**Alcance exato do fechamento — o que NÃO é encerrado por este ato:**

- Itens C-H de `AUD-ALOG-01` (sete call sites DEV/HOMOLOGAÇÃO onde `logAction` nunca foi
  instalado) permanecem **CONFIRMED, abertos**, intocados. Nenhuma evidência sobre eles foi
  produzida ou avaliada nesta rodada nem em nenhuma anterior.
- O parcial de `saleController.ts` permanece **CONFIRMED, aberto**, intocado.
- `AUD-DB-04` (MEDIUM) permanece **aberto** — o `entity_id NULL` em B é contorno declarado
  (`OR-21`), não correção de causa-raiz, e a própria evidência desta rodada confirma essa
  característica em vez de contradizê-la (§10.3).
- Este veredito **não** cobre os demais 11 dos 13 call sites do critério dinâmico completo
  `DYN-T03-07` (finding §7) — cobre apenas os 2 (A e B) para os quais foi produzida evidência
  admissível. O critério dinâmico do finding inteiro permanece "Não executado" para os outros
  11.
- `REMEDIATION COMPLETE` não é declarado por este ato (Regra 3 — autoridade da SanaCore, já
  usada por ela nos commits `fe60f91`/`a44f25b`; este ato não ratifica nem contesta a
  nomenclatura, apenas fecha o finding sob autoridade própria, Regra 4).

Esta granularidade (item por item, não o finding inteiro de uma vez) é a mesma que este
director aplicou desde a rodada 1 (§7: registro separado por item A/B desde o início) — não é
uma invenção desta rodada, é a disciplina já fixada sendo levada à conclusão que ela mesma
previa em §9.4.4 ("este director profere o veredito final... se a persistência confirmar o
que foi descrito").

### 10.6 Encaminhamentos

1. **Ao CoreTriad Director / registro do run:** `AUDIT_VERDICT.md` (`AUDIT_PASSED`,
   2026-08-17) deve ser atualizado para refletir que o reteste de `CASE-004`, quanto aos itens
   A e B de `AUD-ALOG-01`, está concluído (`RETEST_PASSED`/`FINDING CLOSED`), permanecendo
   pendente apenas quanto aos itens C-H e ao parcial de `sales`. Esta atualização é do
   CoreTriad Director/registro do run, não deste artefato.
2. **À SanaCore:** nenhuma ação de código adicional para A/B. Itens C-H seguem a fila normal
   de remediação já registrada no finding (§5, §6).
3. **Ao dono (humano):** nenhuma decisão pendente quanto a A/B. Nenhum teto de rodadas (§22.4,
   5 rodadas sem `PASS`) foi atingido — este é o `PASS` na rodada 3 de reteste.
4. **Escrita deste ato:** exclusivamente este arquivo, em `audit/runs/`. Nenhum artefato
   histórico alterado (§1-9 preservados linha a linha, Regra 15). Nada em `remediation/`,
   `src/`, `server/`, `client/`, `tests/`, `coretriad/` (Regra 2).
