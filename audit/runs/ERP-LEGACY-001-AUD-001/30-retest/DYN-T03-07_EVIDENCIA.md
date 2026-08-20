---
AUDIT_ID: ERP-LEGACY-001-AUD-001
FINDING_ID: AUD-ALOG-01
CASE_ID: ERP-LEGACY-001-CASE-004
PROVA: DYN-T03-07 (reteste dinamico)
ITENS_COBERTOS: A, B
FONTE:
  agente_executor: vericore-integration-retest-runner
  agente_depositario: vericore-audit-evidence-controller
  data_execucao: 2026-08-20 (~10:34-10:35 America/Sao_Paulo, UTC-03 / 13:34-13:35 UTC)
  data_persistencia: 2026-08-20
BANCO_ALVO: erp_evok_audio_test (confirmado em todos os passos de comando de banco; nenhuma referencia a erp_evok_audio/producao)
WORKTREE_ORIGEM: C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004
BRANCH_ORIGEM: sana/ERP-LEGACY-001/CASE-004
HEAD_NO_MOMENTO: 2c10a80
REMEDIATION_COMMITS_AVALIADOS:
  - fe60f9114b0ab76a1c0e9f18369c1ae4f614026b (estagio 1, item A)
  - a44f25bfbe2d0506ff53f5a553d3403fb675c05c (estagio 2, item B)
MOTIVO: cobrir as duas lacunas apontadas em VERDICT_CASE-004.md secao 9 (user_ip do item A
  nao confirmado; old_values/new_values do item B nao confirmados), com persistencia formal
  em arquivo (nao apenas relato em prosa).
STATUS_DECLARADO_NESTE_DOCUMENTO: nenhum (RETEST_PASSED/FAILED e FINDING CLOSED sao
  atribuicao exclusiva do vericore-software-audit-director — Regra 4 do CLAUDE.md).
NOTA_DE_CUSTODIA: este documento e depositado fielmente, sem edicao de conteudo tecnico.
  Duas categorias de valor foram redigidas ([REDACTED]) por serem segredos em texto claro
  (senha de banco de teste, JWT secret, webhook secret, token JWT emitido), conforme
  restricao do vericore-audit-evidence-controller de nao reproduzir segredos na evidencia
  persistida. Nenhum outro conteudo foi alterado, resumido ou reordenado.
---

# EVIDENCIA BRUTA — DYN-T03-07 (reteste dinamico) — ERP-LEGACY-001-CASE-004

> Conteudo abaixo preservado fielmente a partir do arquivo de origem entregue pelo agente
> executor (scratchpad da sessao), exceto pelas redacoes de segredo explicitamente marcadas
> `[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller]`.

```
EVIDENCIA BRUTA — DYN-T03-07 (reteste dinamico), ERP-LEGACY-001-CASE-004
Finding: AUD-ALOG-01, itens A e B
Executor: vericore-integration-retest-runner (executado nesta sessao no papel dessa carta)
Data/hora local da execucao: 2026-08-20, ~10:34-10:35 (America/Sao_Paulo, UTC-03) / 13:34-13:35 UTC
Worktree: C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004
Branch: sana/ERP-LEGACY-001/CASE-004
HEAD do worktree no momento da execucao: 2c10a80 (confirmado abaixo, passo 0)
REMEDIATION_COMMITS avaliados: fe60f9114b0ab76a1c0e9f18369c1ae4f614026b (estagio 1, item A),
                                a44f25bfbe2d0506ff53f5a553d3403fb675c05c (estagio 2, item B)

Motivo deste artefato: audit/runs/ERP-LEGACY-001-AUD-001/30-retest/VERDICT_CASE-004.md
secao 9 recusou uma execucao anterior por falta de persistencia em arquivo (relato so em
prosa) e por duas lacunas de conteudo: user_ip do item A nao confirmado, e old_values/
new_values do item B nao confirmados. Este arquivo cobre exatamente essas duas lacunas,
com comando exato + saida completa (sem resumir campos) de cada passo.

REGRA ABSOLUTA (carta do agente): banco-alvo confirmado e ecoado antes de QUALQUER
comando de banco, em cada passo abaixo. Alvo usado do inicio ao fim: erp_evok_audio_test.
Nenhum comando neste arquivo referencia erp_evok_audio (producao) em nenhum momento.

================================================================================
PASSO 0 — estado do worktree ANTES de qualquer execucao
================================================================================

$ cd "C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004"
$ git branch --show-current
sana/ERP-LEGACY-001/CASE-004

$ git log --oneline -5
2c10a80 docs(sanacore): CASE-004 estagio 2 REMEDIATION_COMPLETE (AUD-ALOG-01/B)
a44f25b fix(items): trilha de auditoria na inativacao (AUD-ALOG-01/B)
9d42cbc Merge branch 'audit/ERP-LEGACY-001-AUD-001/2026-08-16' into sana/ERP-LEGACY-001/CASE-004
b6f7fcd docs(sanacore): CASE-004 estagio 1 REMEDIATION_COMPLETE (AUD-ALOG-01/A)
fe60f91 fix(employees): trilha de auditoria no desligamento (AUD-ALOG-01/A)

$ git status --short
(saida vazia)

================================================================================
PASSO 1 — confirmacao do banco-alvo e do estado das migrations (LEITURA)
================================================================================

$ TARGET_DB="erp_evok_audio_test"; echo "ALVO CONFIRMADO PARA LEITURA: $TARGET_DB"
ALVO CONFIRMADO PARA LEITURA: erp_evok_audio_test

$ docker exec evok-postgres psql -U evok_admin -d "$TARGET_DB" -c "SELECT count(*) FROM \"SequelizeMeta\";"
 count
-------
   172
(1 row)

(172/172 migrations, conforme audit/runs/ERP-LEGACY-001-AUD-001/07-findings/G5_RECRIACAO_BANCO_TESTE.md)

$ docker exec evok-postgres psql -U evok_admin -d "$TARGET_DB" -c "SELECT id, email, role, active FROM users LIMIT 10;"
 id |         email          | role  | active
----+------------------------+-------+--------
  1 | admin@evokaudio.com.br | admin | t
(1 row)

$ docker exec evok-postgres psql -U evok_admin -d "$TARGET_DB" -c "SELECT id, email, role, active, password_version FROM users WHERE id=1;"
 id |         email          | role  | active | password_version
----+------------------------+-------+--------+------------------
  1 | admin@evokaudio.com.br | admin | t      |                1
(1 row)

$ docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED        STATUS                 PORTS                                         NAMES
2e1a1df92023   erp-evok-audio-server:local   "docker-entrypoint.s…"   23 hours ago   Up 3 hours (healthy)   0.0.0.0:5000->5000/tcp, [::]:5000->5000/tcp   evok-api
24941ad4d483   postgres:16-alpine            "docker-entrypoint.s…"   9 days ago     Up 3 hours (healthy)   127.0.0.1:5432->5432/tcp                      evok-postgres

Nota: `evok-api` (porta 5000) e o servidor existente (dev/producao-like) e NAO foi tocado
nesta execucao. O servidor de teste desta prova sobe em processo Node separado, porta 3103,
fora do Docker, apontado explicitamente para erp_evok_audio_test via variaveis de ambiente
de processo (nao para .env do worktree — nenhum arquivo criado).

================================================================================
PASSO 2 — build do worktree (nao versionado; server/dist esta no .gitignore)
================================================================================

$ cd "C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004/server"
$ npm run build

> erp-evok-audio-server@1.0.0 build
> tsc -p tsconfig.build.json

(saida vazia — typecheck limpo, build concluido sem erro)

================================================================================
PASSO 3 — subida do servidor de teste isolado (porta 3103, != 5000)
================================================================================

$ TARGET_DB="erp_evok_audio_test"; echo "ALVO CONFIRMADO PARA BOOT DO SERVIDOR DE TESTE: $TARGET_DB"
ALVO CONFIRMADO PARA BOOT DO SERVIDOR DE TESTE: erp_evok_audio_test

Variaveis de ambiente exportadas SOMENTE no processo do shell que subiu o servidor
(nenhum arquivo .env criado no worktree):

  NODE_ENV=test
  PORT=3103
  DB_HOST=localhost
  DB_PORT=5432
  DB_NAME=erp_evok_audio_test
  DB_USER=evok_admin
  DB_PASSWORD=[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller]
  DB_SSL=false
  ALLOW_LOCAL_DB_NO_SSL=true
  JWT_SECRET=[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller]
  JWT_EXPIRE=1h
  ADMIN_SEED_PASSWORD=not-used-userCount-gt-0   (nao usado: seeds so rodam com users.count()==0; a tabela ja tinha 1 usuario, seeds foram pulados — ver log abaixo)
  N8N_WEBHOOK_SECRET=[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller]
  PRODUCTION_TRACKING_REQUIRED=warn   (NODE_ENV=test; a restricao "warn proibido" so vale para NODE_ENV=production, nao verificada aqui)
  TRUST_PROXY=0

$ nohup node dist/index.js > /tmp/dyn-t03-07-server.log 2>&1 &
PID=1106

Saida completa do log do servidor (arquivo /tmp/dyn-t03-07-server.log), da subida ate o encerramento:

PostgreSQL conectado: localhost:5432/erp_evok_audio_test (postgres)
Bootstrap sem DDL automatico. Use migrations versionadas para evolucao de schema.
📊 Banco já possui dados, seeds ignorados.
10:34:17 info: Servidor rodando na porta 3103
10:34:17 info: Ambiente: test
10:34:17 info: Banco: PostgreSQL via Sequelize
10:34:46 info: http_request {"requestId":"89cb2a45-ab75-4e83-8595-c413097f681a","method":"GET","path":"/health/ready","statusCode":200,"durationMs":14}
10:34:46 info: http_request {"requestId":"667f66a8-4a37-4bc8-8187-d913f4bcf070","method":"GET","path":"/api/auth/me","statusCode":200,"durationMs":15}
10:34:52 info: http_request {"requestId":"ea14eac1-a016-4e34-b6f1-de2d229f11d0","method":"POST","path":"/api/employees","statusCode":400,"durationMs":33}
10:34:53 info: http_request {"requestId":"20765bad-c0c1-464a-8b27-7dd7b2664b4f","method":"POST","path":"/api/items","statusCode":409,"durationMs":9}
10:34:53 info: http_request {"requestId":"56e65921-146b-49d3-900a-e3f3aee9812f","method":"POST","path":"/api/items","statusCode":409,"durationMs":5}
10:35:07 info: http_request {"requestId":"2b54ebd1-4525-43ab-b4b9-6e1b3f115013","method":"POST","path":"/api/employees","statusCode":201,"durationMs":43}
10:35:07 info: http_request {"requestId":"13a660f8-372a-48de-877f-32108bebf505","method":"POST","path":"/api/items","statusCode":201,"durationMs":18}
10:35:07 info: http_request {"requestId":"dce053a0-d2cf-441d-91f4-9c21f1920cd8","method":"POST","path":"/api/items","statusCode":201,"durationMs":12}
10:35:12 info: http_request {"requestId":"17f6cbfd-013a-4105-aa7a-1b5f20ff2e9d","method":"DELETE","path":"/api/employees/2","statusCode":200,"durationMs":17}
10:35:12 info: http_request {"requestId":"5dd9d8ea-2f1b-4594-9efe-1c4f2dc5c8c2","method":"PATCH","path":"/api/items/9c961d5b-3b74-46a0-bfcb-9ada11a93358/inactivate","statusCode":200,"durationMs":50}
10:35:12 info: http_request {"requestId":"ff89eabc-c92d-463d-a3ae-0f2016de1da7","method":"DELETE","path":"/api/items/ade6960e-a200-4823-a8a9-70a82a754388","statusCode":200,"durationMs":23}

Nota sobre as duas primeiras tentativas com status 400/409 (10:34:52-10:34:53): a primeira
POST /api/employees falhou com `Employee.department_id cannot be null` (nao-nulo no schema,
nao declarado como obrigatorio no use case) — corrigida enviando `department_id:1` na
tentativa seguinte. As duas POST /api/items falharam com 409 porque os codigos
`DYN-T03-07-ITEM-A`/`-B` (sem timestamp) ja existiam no banco, inativos, de uma execucao
anterior desta mesma prova (rodada nao persistida, ver nota no PASSO 5). Resolvido usando
codigos com sufixo de timestamp unico (`-1787232907`) nas fixtures efetivamente usadas nesta
rodada. Nenhuma dessas 3 tentativas malsucedidas tocou audit_logs (nenhuma mutou estado).

================================================================================
PASSO 4 — login real via JWT (validado pelo middleware `authenticate` real, contra o
usuario real do banco de teste, nao um dublê)
================================================================================

$ cd "C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004/server"
$ export JWT_SECRET="[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller]"
$ node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 1, passwordVersion: 1 }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: 'erp-evok-audio', audience: 'erp-evok-audio-api' });
console.log(token);
"
[REDACTED — segredo/credencial removido pelo vericore-audit-evidence-controller: token JWT assinado, contem apenas claims nao-sensiveis id/passwordVersion/iat/exp/aud/iss, mas o valor completo do token e em si um credencial de sessao e nao e reproduzido aqui]

Tecnica identica a `scripts/run-api-suite.cjs#mint` (ja usada pelo proprio projeto para a
suite de integracao real) e a `tests/helpers/testApi.ts#mintToken` — assina com o
JWT_SECRET que o SERVIDOR REAL desta execucao usa (mesmo processo, mesma variavel de
ambiente), e o token e verificado pelo `authenticate` real (`src/middlewares/auth.ts`),
inclusive a checagem de `passwordVersion` contra o valor atual do usuario no banco
(passo 1: password_version=1, igual ao do payload). Nao e um dublê/mock: o middleware real
faz `jwt.verify` com issuer/audience reais e uma query real ao Postgres de teste
(`User.findByPk`). Confirmacao abaixo (GET /api/auth/me) prova que o servidor aceitou o
token como sessao valida do usuario real id=1.

$ curl -s http://127.0.0.1:3103/health/ready
{"status":"ready","database":"up","timestamp":"2026-08-20T13:34:46.598Z"}

$ TOKEN=<token acima>
$ curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3103/api/auth/me
{"success":true,"data":{"id":1,"name":"Administrador","email":"admin@evokaudio.com.br","role":"admin","department":"","active":true,"passwordVersion":1,"accessProfileId":null,"createdAt":"2026-08-20T12:43:52.959Z","updatedAt":"2026-08-20T12:43:52.959Z"}}

================================================================================
PASSO 5 — criacao dos fixtures novos (1 Employee, 2 Item), via API real (nao SQL direto)
================================================================================

$ curl -s -X POST http://127.0.0.1:3103/api/employees \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"DYN-T03-07 Funcionario Fixture","cpf":"52998224725","position":"Operador CI","hire_date":"2026-01-10","department_id":1}'
{"success":true,"data":{"salary":"0.00","salary_type":"mensal","shift":"commercial","work_regime":"clt","work_hours_weekly":44,"bank_account_type":"corrente","id":2,"name":"DYN-T03-07 Funcionario Fixture","cpf":"52998224725","rg":null,"pis_pasep":null,"ctps":null,"phone":null,"email":null,"position":"Operador CI","department_id":1,"hire_date":"2026-01-10","bank_name":null,"bank_agency":null,"bank_account":null,"pix_key":null,"notes":null,"pcd":null,"job_position_id":null,"status":"active","updatedAt":"2026-08-20T13:35:07.721Z","createdAt":"2026-08-20T13:35:07.721Z","user_id":null,"address":null,"dismissal_date":null,"education_level":null,"emergency_contact":null,"emergency_phone":null,"photo_url":null}}

  -> Employee id=2 criado.

$ curl -s -X POST http://127.0.0.1:3103/api/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"codigo":"DYN-T03-07-ITEM-A-1787232907","descricao":"Item fixture DYN-T03-07 (rota PATCH inactivate)","tipo":"MATERIA_PRIMA","unidade":"un"}'
{"success":true,"data":{"id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","descricao":"Item fixture DYN-T03-07 (rota PATCH inactivate)","tipo":"MATERIA_PRIMA","unidade":"un","status":"ATIVO","estoque_atual":"0.000000","estoque_reservado":"0.000000","estoque_seguranca":"0.000000","lote_minimo":"0.000000","lead_time_dias":0,"custo_padrao":"0.000000","fornecedor_padrao_id":null,"conversao_automatica":false,"atualizado_em":"2026-08-20T13:35:07.800Z","criado_em":"2026-08-20T13:35:07.800Z"}}

  -> Item A (PATCH inactivate) id=9c961d5b-3b74-46a0-bfcb-9ada11a93358 criado, status ATIVO.

$ curl -s -X POST http://127.0.0.1:3103/api/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"codigo":"DYN-T03-07-ITEM-B-1787232907","descricao":"Item fixture DYN-T03-07 (rota DELETE)","tipo":"MATERIA_PRIMA","unidade":"un"}'
{"success":true,"data":{"id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","descricao":"Item fixture DYN-T03-07 (rota DELETE)","tipo":"MATERIA_PRIMA","unidade":"un","status":"ATIVO","estoque_atual":"0.000000","estoque_reservado":"0.000000","estoque_seguranca":"0.000000","lote_minimo":"0.000000","lead_time_dias":0,"custo_padrao":"0.000000","fornecedor_padrao_id":null,"conversao_automatica":false,"atualizado_em":"2026-08-20T13:35:07.853Z","criado_em":"2026-08-20T13:35:07.853Z"}}

  -> Item B (DELETE) id=ade6960e-a200-4823-a8a9-70a82a754388 criado, status ATIVO.

Nota (transparencia): antes destas 3 chamadas bem-sucedidas, uma primeira tentativa de
POST /api/employees (sem department_id) falhou com 400 `Employee.department_id cannot be
null`, e duas tentativas de POST /api/items com codigos sem sufixo de timestamp
(`DYN-T03-07-ITEM-A`/`-B`) falharam com 409 porque ja existiam no banco (registrados
INATIVO, id 18c95a71-6c33-480e-9f22-80dc303123a0 e 3f171988-87e7-4794-b40c-3ec2a025b142),
remanescentes de uma execucao anterior desta mesma prova que nao foi persistida em
arquivo. Essas 3 tentativas malsucedidas nao mutaram audit_logs (nenhum INSERT resultante,
confirmado no PASSO 7 pela ausencia de linhas correspondentes a elas) e nao afetam o
resultado desta prova. Os fixtures EFETIVOS desta rodada sao os 3 acima (Employee id=2,
Item -A-1787232907, Item -B-1787232907).

================================================================================
PASSO 6 — exercicio das 3 rotas auditadas (item A e as duas rotas do item B)
================================================================================

$ curl -s -X DELETE http://127.0.0.1:3103/api/employees/2 -H "Authorization: Bearer $TOKEN"
{"success":true,"data":{"message":"Funcionário desligado com sucesso"}}

$ curl -s -X PATCH http://127.0.0.1:3103/api/items/9c961d5b-3b74-46a0-bfcb-9ada11a93358/inactivate -H "Authorization: Bearer $TOKEN"
{"success":true,"data":{"id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","descricao":"Item fixture DYN-T03-07 (rota PATCH inactivate)","tipo":"MATERIA_PRIMA","unidade":"un","status":"INATIVO","estoque_atual":"0.000000","estoque_reservado":"0.000000","estoque_seguranca":"0.000000","lote_minimo":"0.000000","lead_time_dias":0,"custo_padrao":"0.000000","fornecedor_padrao_id":null,"conversao_automatica":false,"criado_em":"2026-08-20T13:35:07.800Z","atualizado_em":"2026-08-20T13:35:12.591Z"}}

$ curl -s -X DELETE http://127.0.0.1:3103/api/items/ade6960e-a200-4823-a8a9-70a82a754388 -H "Authorization: Bearer $TOKEN"
{"success":true,"data":{"id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","descricao":"Item fixture DYN-T03-07 (rota DELETE)","tipo":"MATERIA_PRIMA","unidade":"un","status":"INATIVO","estoque_atual":"0.000000","estoque_reservado":"0.000000","estoque_seguranca":"0.000000","lote_minimo":"0.000000","lead_time_dias":0,"custo_padrao":"0.000000","fornecedor_padrao_id":null,"conversao_automatica":false,"criado_em":"2026-08-20T13:35:07.853Z","atualizado_em":"2026-08-20T13:35:12.674Z"}}

Todas as 3 chamadas responderam 200, sem 22P02/NaN, sem erro serializado no corpo.

================================================================================
PASSO 7 — consulta de audit_logs (LEITURA, banco confirmado), TODOS os campos, sem truncar
================================================================================

$ TARGET_DB="erp_evok_audio_test"; echo "ALVO CONFIRMADO PARA LEITURA: $TARGET_DB"
ALVO CONFIRMADO PARA LEITURA: erp_evok_audio_test

$ docker exec evok-postgres psql -U evok_admin -d "$TARGET_DB" -x -c "SELECT id, action, entity_type, entity_id, entity_description, user_id, user_name, user_ip, user_agent, route, method, created_at, old_values, new_values FROM audit_logs WHERE (entity_type='Employee' AND entity_id=2) OR (entity_type='Item' AND entity_description LIKE '%DYN-T03-07-ITEM%') ORDER BY id;"

-[ RECORD 1 ]------+---------------------------------------------------------------------------------------------------------------------------
id                 | 4
action             | soft_delete
entity_type        | Item
entity_id          |
entity_description | DYN-T03-07-ITEM-A — DYN-T03-07 test item A (PATCH inactivate) (uuid 18c95a71-6c33-480e-9f22-80dc303123a0)
user_id            | 1
user_name          | Administrador
user_ip            | ::ffff:127.0.0.1
user_agent         | curl/8.21.0
route              | /api/items/18c95a71-6c33-480e-9f22-80dc303123a0/inactivate
method             | PATCH
created_at         | 2026-08-20 09:45:07.564-03
old_values         | {"item_id":"18c95a71-6c33-480e-9f22-80dc303123a0","codigo":"DYN-T03-07-ITEM-A","status":"ATIVO"}
new_values         | {"item_id":"18c95a71-6c33-480e-9f22-80dc303123a0","codigo":"DYN-T03-07-ITEM-A","status":"INATIVO"}
-[ RECORD 2 ]------+---------------------------------------------------------------------------------------------------------------------------
id                 | 5
action             | soft_delete
entity_type        | Item
entity_id          |
entity_description | DYN-T03-07-ITEM-B — DYN-T03-07 test item B (DELETE) (uuid 3f171988-87e7-4794-b40c-3ec2a025b142)
user_id            | 1
user_name          | Administrador
user_ip            | ::ffff:127.0.0.1
user_agent         | curl/8.21.0
route              | /api/items/3f171988-87e7-4794-b40c-3ec2a025b142
method             | DELETE
created_at         | 2026-08-20 09:45:07.63-03
old_values         | {"item_id":"3f171988-87e7-4794-b40c-3ec2a025b142","codigo":"DYN-T03-07-ITEM-B","status":"ATIVO"}
new_values         | {"item_id":"3f171988-87e7-4794-b40c-3ec2a025b142","codigo":"DYN-T03-07-ITEM-B","status":"INATIVO"}
-[ RECORD 3 ]------+---------------------------------------------------------------------------------------------------------------------------
id                 | 6
action             | soft_delete
entity_type        | Employee
entity_id          | 2
entity_description | DYN-T03-07 Funcionario Fixture
user_id            | 1
user_name          | Administrador
user_ip            | ::ffff:127.0.0.1
user_agent         | curl/8.21.0
route              | /api/employees/2
method             | DELETE
created_at         | 2026-08-20 10:35:12.525-03
old_values         | {"status":"active","dismissal_date":null}
new_values         | {"status":"inactive","dismissal_date":"2026-08-20"}
-[ RECORD 4 ]------+---------------------------------------------------------------------------------------------------------------------------
id                 | 7
action             | soft_delete
entity_type        | Item
entity_id          |
entity_description | DYN-T03-07-ITEM-A-1787232907 — Item fixture DYN-T03-07 (rota PATCH inactivate) (uuid 9c961d5b-3b74-46a0-bfcb-9ada11a93358)
user_id            | 1
user_name          | Administrador
user_ip            | ::ffff:127.0.0.1
user_agent         | curl/8.21.0
route              | /api/items/9c961d5b-3b74-46a0-bfcb-9ada11a93358/inactivate
method             | PATCH
created_at         | 2026-08-20 10:35:12.615-03
old_values         | {"item_id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","status":"ATIVO"}
new_values         | {"item_id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","status":"INATIVO"}
-[ RECORD 5 ]------+---------------------------------------------------------------------------------------------------------------------------
id                 | 8
action             | soft_delete
entity_type        | Item
entity_id          |
entity_description | DYN-T03-07-ITEM-B-1787232907 — Item fixture DYN-T03-07 (rota DELETE) (uuid ade6960e-a200-4823-a8a9-70a82a754388)
user_id            | 1
user_name          | Administrador
user_ip            | ::ffff:127.0.0.1
user_agent         | curl/8.21.0
route              | /api/items/ade6960e-a200-4823-a8a9-70a82a754388
method             | DELETE
created_at         | 2026-08-20 10:35:12.678-03
old_values         | {"item_id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","status":"ATIVO"}
new_values         | {"item_id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","status":"INATIVO"}

IMPORTANTE — quais linhas sao desta rodada: os REGISTROS 3, 4 e 5 (id=6,7,8, created_at
10:35:12) sao os 3 gerados por esta execucao (PASSO 6). Os REGISTROS 1 e 2 (id=4,5,
created_at 09:45:07) sao remanescentes de uma execucao anterior desta mesma prova
DYN-T03-07 (a que originou a recusa do director), nao apagados nem alterados por esta
sessao (Regra 15 CLAUDE.md — nenhuma evidencia historica de outro agente/sessao foi
tocada); estao incluidos aqui apenas porque o filtro LIKE os capturou, e ficam registrados
para transparencia, nao como prova desta rodada.

================================================================================
PASSO 8 — confirmacao pontual e explicacao do `user_ip` do item A (exigencia do
VERDICT_CASE-004.md secao 9.2/9.4)
================================================================================

Valor exato de `user_ip` na linha do item A desta rodada (id=6, entity_type=Employee,
entity_id=2, DELETE /api/employees/2):

  user_ip = "::ffff:127.0.0.1"

Nao esta NULL/vazio. Explicacao da forma exata do valor: `AuditLog.register` grava
`data.req?.ip` (`src/models/AuditLog.ts:151`), que e o `req.ip` do Express/Node. O cliente
de teste (`curl`) e o servidor Node rodam ambos em `127.0.0.1` (mesma maquina, sem proxy
reverso na frente — `TRUST_PROXY=0`), e o socket TCP do Node por padrao escuta em IPv6
dual-stack; quando o socket de origem chega via IPv4 sobre uma interface IPv6, o Node
normaliza para o formato IPv4-mapped-IPv6 `::ffff:127.0.0.1` — e exatamente o valor
observado, consistente e reproduzivel nas 5 linhas acima (todas as chamadas desta e da
rodada anterior, feitas do mesmo host para o mesmo servidor local, produzem o mesmo
formato). Em producao, atras de um proxy real com `TRUST_PROXY>=1` configurado, o valor
seria o IP publico real do cliente HTTP (`x-forwarded-for` resolvido pelo Express); aqui,
em ambiente de teste local sem proxy, o valor correto e esperado e o loopback IPv4-mapped
acima — nao e uma falha de captura, e o comportamento correto do codigo dado o ambiente.

================================================================================
PASSO 9 — confirmacao do conteudo de old_values/new_values do item B (exigencia da
VERDICT_CASE-004.md secao 9.2/9.4) — as DUAS rotas
================================================================================

Rota PATCH /:id/inactivate (registro id=7):
  old_values = {"item_id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","status":"ATIVO"}
  new_values = {"item_id":"9c961d5b-3b74-46a0-bfcb-9ada11a93358","codigo":"DYN-T03-07-ITEM-A-1787232907","status":"INATIVO"}

Rota DELETE /:id (registro id=8):
  old_values = {"item_id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","status":"ATIVO"}
  new_values = {"item_id":"ade6960e-a200-4823-a8a9-70a82a754388","codigo":"DYN-T03-07-ITEM-B-1787232907","status":"INATIVO"}

Ambos contem exatamente as 3 chaves exigidas pelo criterio (§5.2 do VERDICT_CASE-004.md):
`item_id`, `codigo`, `status` — nenhuma chave a mais, nenhuma a menos. `entity_id` fica
NULL nas duas linhas, como desenhado pelo contorno declarado (`OR-21`/`AUD-DB-04`, ver
REMEDIATION_RESPONSE_ESTAGIO_2.md §2.1) — a linha e recuperavel por `entity_type='Item'` +
`entity_description` (confirmado: ambas as linhas trazem `codigo` + UUID integros na
descricao), nunca por `entity_id`. `route`/`method` distinguem as duas chamadas
(`PATCH .../inactivate` vs `DELETE /api/items/:id` puro).

================================================================================
PASSO 10 — logs/audit-failures.log (deve estar ausente/vazio)
================================================================================

$ cd "C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004/server"
$ ls -la logs/
total 4
drwxr-xr-x 1 gilwagno.silva 1049089 0 Aug 20 09:12 .
drwxr-xr-x 1 gilwagno.silva 1049089 0 Aug 20 09:43 ..

$ test -f logs/audit-failures.log && cat logs/audit-failures.log || echo "AUSENTE (arquivo nao existe)"
AUSENTE (arquivo nao existe)

Confirma: nenhuma degradacao silenciosa (fire-and-forget engolindo erro) ocorreu nas 3
escritas desta rodada nem nas 2 da rodada anterior residente no banco.

================================================================================
PASSO 11 — encerramento do servidor de teste e estado do worktree DEPOIS
================================================================================

$ kill 1106
$ ps -p 1106
(processo encerrado, sem linhas de saida — confirmado morto)

$ cd "C:/Gilwagno WorkSpace/ERP-Evok-sana-CASE-004"
$ git status --short
(saida vazia, identica ao PASSO 0 — nenhum arquivo do worktree criado, alterado ou
removido por esta execucao. server/dist/ e server/logs/ estao no .gitignore do
worktree e nao aparecem em `git status` mesmo tendo sido escritos pelo build; nenhum
arquivo versionado foi tocado)

================================================================================
RESUMO DE CUSTODIA DE DADO REAL (APR-2026-016 / regra absoluta da carta do agente)
================================================================================

- Todo comando de banco (leitura ou escrita) neste arquivo foi precedido de confirmacao
  explicita e eco do nome do banco-alvo (`erp_evok_audio_test`), passos 1, 3 e 7.
- Nenhum comando neste arquivo referenciou `erp_evok_audio` (producao) em nenhum momento,
  nem para leitura nem para escrita.
- O unico outro banco tocado por qualquer processo nesta maquina durante a execucao e o
  container `evok-postgres`, e todo comando dentro dele foi direcionado com `-d
  erp_evok_audio_test` explicito.
- O container `evok-api` (porta 5000) nao foi parado, reiniciado, nem teve trafego
  direcionado a ele por esta execucao — permaneceu apenas observado via `docker ps`.
- Nenhuma migration foi executada (`npm run migration:up`/`down` nao foram chamados;
  as 172 migrations ja estavam aplicadas ao banco de teste antes desta sessao, confirmado
  no PASSO 1).
- Nenhum arquivo versionado do worktree foi criado, editado ou removido (`git status
  --short` vazio antes e depois, PASSO 0 e PASSO 11). O unico artefato persistido por
  esta execucao e este proprio arquivo, fora do worktree, no diretorio de scratchpad da
  sessao.

================================================================================
O QUE ESTE ARQUIVO NAO FAZ (fora do escopo deste agente)
================================================================================

- Nao declara RETEST_PASSED, RETEST_FAILED, nem FINDING CLOSED — isso e atribuicao
  exclusiva do `vericore-software-audit-director` (Regra 4 CLAUDE.md).
- Nao corrige, refatora nem altera o objeto auditado.
- Nao substitui a persistencia formal em `audit/` sob custodia do
  `vericore-audit-evidence-controller` — este arquivo e entregue a ele (e ao
  solicitante) para essa persistencia formal, conforme VERDICT_CASE-004.md §9.4 item 1.
```
