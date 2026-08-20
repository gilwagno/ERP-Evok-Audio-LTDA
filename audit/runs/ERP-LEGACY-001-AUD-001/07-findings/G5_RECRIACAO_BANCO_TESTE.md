# G5 — Reconciliação: Recriação do Banco de Teste com `main` Atual

- **Auditoria:** ERP-LEGACY-001-AUD-001
- **Gate:** G5 (extensão de G4 — reconciliação do banco de teste `erp_evok_audio_test` com `main` atual; não substitui nem reabre G4)
- **Executor:** OpusCore (`opuscore-devops-engineer`) — infraestrutura de ambiente (não produto, não schema, não achado)
- **Registrador desta evidência:** VeriCore (`vericore-audit-evidence-controller`) — apenas deposito fiel do relato do executor; **não reexecutei nenhum comando abaixo, não conectei a nenhum banco, não rodei `git log` nem `docker exec`**. Toda a narrativa e todos os números desta seção são reportados verbatim pelo `opuscore-devops-engineer`; verificação independente desses comandos e saídas é atribuição de outra organização/agente, não deste registrador.
- **Data de execução:** 2026-08-20
- **Precedente estendido:** `audit/runs/ERP-LEGACY-001-AUD-001/07-findings/G4_PRECONDICAO_BANCO_TESTE.md` (2026-08-16) — este documento não altera, corrige nem reabre aquele; é registro histórico independente e adicional (Regra 15 CLAUDE.md).

## 1. Motivo da execução

Diferente do G4 (que tratava de **contaminação** por branch não mesclada), o
motivo aqui é **defasagem**: o banco de teste estava desatualizado frente a
`main` atual.

Estado medido antes da recriação:

```
$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) FROM \"SequelizeMeta\";"
 count
-------
   168
```

`ls server/migrations | wc -l` em `main` = 172. Faltavam as migrations no
intervalo `20260812-000047` a `20260819-000052` — 4 arquivos de migration
especificamente:

- `20260812-000047-hr-absences-open-unique.cjs`
- `20260814-000048-jur-approval-thresholds-and-authority-find-erp-005.cjs`
- `20260818-000051-hr-termination-reason.cjs`
- `20260819-000052-add-purchase-receipts-and-cost-ledger-fks.cjs`

(Não existem migrations com sufixo `-000049-` ou `-000050-` em `main` nesta
faixa de datas — a numeração sequencial do repositório não é contígua; o
intervalo nominal "047 a 052" contém exatamente esses 4 arquivos, não 6.)
168 + 4 = 172, fechando exatamente com o total de arquivos em `main`.

## 2. Achado relevante — divergência com o racional do G4 (nota, sem reabrir G4)

A migration `20260814-000048-jur-approval-thresholds-and-authority-find-erp-005.cjs`
— que no G4 (2026-08-16) representava exatamente a **contaminação** da tabela
`jur_approval_thresholds`, trazida pela branch **não mesclada**
`sana/ERP-LEGACY-001/FIND-ERP-005` — está **hoje commitada diretamente em
`main`**, segundo relato do executor: commit `92cb690`, confirmado por ele via
`git log --oneline main -- server/migrations/20260814-000048-jur-approval-thresholds-and-authority-find-erp-005.cjs`.

Ou seja: `jur_approval_thresholds` **deixou de ser contaminação e passou a ser
schema oficial de `main`** entre 2026-08-16 (data do G4) e 2026-08-20 (data
deste G5). Isto é registrado aqui como nota factual explícita, não como
alteração retroativa do veredito do G4 — o G4 permanece intocado e válido
para o estado que media, no momento em que o mediu (Regra 15 CLAUDE.md). Este
registrador não verificou por si mesmo o commit `92cb690` (não tenho
ferramenta de execução de `git` nesta sessão) — a confirmação do merge é
inteiramente atribuída ao relato do executor.

## 3. Estado do Docker

Diferente do G4 (que precisou religar o daemon do Docker Desktop), desta vez
os containers já estavam de pé e saudáveis, segundo relato do executor:

```
$ docker ps -a
CONTAINER ID   IMAGE                         STATUS                 NAMES
...            erp-evok-audio-server:local   Up ... (healthy)       evok-api
...            postgres:16-alpine            Up ... (healthy)       evok-postgres
```

Não foi necessário `docker compose up -d` nem reiniciar o Docker Desktop.

## 4. Confirmação de branch

```
$ git branch --show-current
main

$ git branch -a --no-merged main
```

Segundo relato do executor, nenhuma branch com migrations pendentes aparece
como não mesclada em relação a `main` neste momento — ou seja, não há
repetição do cenário de contaminação do G4.

## 5. Recriação do banco (drop + create), alvo confirmado

Todos os comandos abaixo são relatados pelo executor como executados via
`docker exec evok-postgres psql -U evok_admin -d postgres` (para as operações
administrativas de DROP/CREATE) ou `-d erp_evok_audio_test` (para o restante).
Nenhum comando referenciou `erp_evok_audio` (produção) em nenhum momento,
segundo o relato.

1. Confirmação do alvo antes de qualquer comando destrutivo:

```
$ TARGET_DB="erp_evok_audio_test"
echo "ALVO CONFIRMADO: $TARGET_DB"
ALVO CONFIRMADO: erp_evok_audio_test
```

2. Terminação de conexões ativas contra `erp_evok_audio_test`:

```
$ docker exec evok-postgres psql -U evok_admin -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'erp_evok_audio_test' AND pid <> pg_backend_pid();"
 pg_terminate_backend
----------------------
(0 rows)
```

0 conexões ativas encontradas (nada a terminar).

3. Drop:

```
$ docker exec evok-postgres psql -U evok_admin -d postgres -c "DROP DATABASE IF EXISTS erp_evok_audio_test;"
DROP DATABASE
```

4. Create:

```
$ docker exec evok-postgres psql -U evok_admin -d postgres -c "CREATE DATABASE erp_evok_audio_test OWNER evok_admin ENCODING 'UTF8';"
CREATE DATABASE
```

5. Confirmação de banco vazio antes de migrar:

```
$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';"
 tables
--------
      0
```

## 6. Aplicação das migrations de `main`

Variáveis de ambiente exportadas explicitamente pelo executor, mesmo padrão
do G4:

```
$ export DB_HOST=localhost DB_PORT=5432 DB_NAME=erp_evok_audio_test \
         DB_USER=evok_admin DB_PASSWORD=evok_dev_password DB_SSL=false \
         SEQUELIZE_ENV=test
```

```
$ npm run migration:up
```

(executado dentro de `server/`). Saída relatada: 172/172 migrations
executadas sequencialmente sem erro, da primeira até
`20260819-000052-add-purchase-receipts-and-cost-ledger-fks`. Nenhuma falha,
nenhum rollback.

## 7. Integridade final — números relatados pelo executor

```
$ ls server/migrations | wc -l
172

$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) FROM \"SequelizeMeta\";"
 count
-------
   172

$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
 table_count
-------------
         209

$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) AS fk_count FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public';"
 fk_count
----------
      483

$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT count(*) AS trigger_count FROM information_schema.triggers WHERE trigger_schema='public';"
 trigger_count
---------------
            23

$ docker exec evok-postgres psql -U evok_admin -d erp_evok_audio_test -c \
  "SELECT to_regclass('public.jur_approval_thresholds') AS jur_table_exists;"
    jur_table_exists
-------------------------
 jur_approval_thresholds
(1 row)
```

172 migrations aplicadas = 172 arquivos existentes em `main` (match exato).
`jur_approval_thresholds`: **presente** — e, ao contrário do estado medido no
G4, agora **legítima** (schema oficial de `main`, ver Seção 2), não mais
contaminação.

Health check final:

```
$ docker exec evok-postgres pg_isready -U evok_admin -d erp_evok_audio_test
/var/run/postgresql:5432 - accepting connections
```

## 8. Conciliação com G4

| Métrica | G4 (2026-08-16, banco recriado limpo) | G5 (2026-08-20, banco recriado reconciliado com `main` atual) | Delta |
|---|---|---|---|
| Tabelas (public, base) | 207 | **209** | +2 |
| FKs | 478 | **483** | +5 |
| Migrations aplicadas (`SequelizeMeta`) | 169 | **172** | +3 |
| `jur_approval_thresholds` presente | não (contaminação removida) | **sim** (legítima, agora em `main`) | — |

Delta de +2 tabelas / +5 FKs / +3 migrations, consistente — segundo relato do
executor — com as 3 migrations novas aplicadas a `main` desde o G4:

- `20260814-000048-jur-approval-thresholds-and-authority-find-erp-005.cjs`
  (traz `jur_approval_thresholds`, agora legítima)
- `20260818-000051-hr-termination-reason.cjs`
- `20260819-000052-add-purchase-receipts-and-cost-ledger-fks.cjs`

Este registrador não possui os detalhes de quantas tabelas/FKs cada uma das 3
migrations acrescenta individualmente (não reexecutei nem inspecionei o
conteúdo de cada arquivo linha a linha para essa decomposição); registro o
delta agregado (+2 tabelas / +5 FKs / +3 migrations) como reportado pelo
executor, sem afirmar a atribuição exata de quantas tabelas/FKs vêm de cada
migration individual — isso fica como limitação explícita, não como
afirmação.

`G4_PRECONDICAO_BANCO_TESTE.md` não foi alterado por este registro.

## 9. Restrições confirmadas pelo executor

- Nenhum comando referenciou `erp_evok_audio` (produção) em nenhum momento.
- `erp_evok_audio_test_ci` não foi tocado.
- `apply-pending-migrations.cjs` não foi executado.
- Nenhum seed foi executado.
- Nenhum arquivo do repositório foi alterado — apenas operações de
  banco/Docker.

## 10. Veredito

**O banco `erp_evok_audio_test` está atualizado (172/172 migrations de
`main`), íntegro, e pronto para servir de base de prova dinâmica de
reteste** — mesma conclusão estrutural do G4, agora reconciliada com o
estado atual de `main`.

Base objetiva do veredito (conforme relatado):
- Recriado do zero (`DROP DATABASE` + `CREATE DATABASE`), 0 tabelas antes de migrar.
- 172/172 migrations de `main` aplicadas sem erro, na ordem correta.
- `jur_approval_thresholds` presente e legítima (não mais contaminação — commit direto em `main`, conforme Seção 2).
- 209 tabelas / 483 FKs / 23 triggers medidos, delta conciliado exatamente com o G4.
- `pg_isready` respondendo.
- Containers `evok-api` e `evok-postgres` já `Up ... (healthy)` — nenhuma reinicialização de Docker Desktop necessária.

## 11. Pendência para o dono / VeriCore

- Nenhum achado de produto, schema ou código é declarado por este documento
  — é infraestrutura de ambiente, mesma natureza do G4 (Seção 6 do G4).
- A mudança de status de `jur_approval_thresholds` (de contaminação, no G4,
  para schema oficial de `main`, neste G5) é registrada aqui apenas como
  fato reconciliador entre dois momentos distintos; qualquer decisão sobre o
  que essa mudança significa para achados relacionados a `FIND-ERP-005`, seu
  histórico de remediação, ou para o estado de qualquer caso/finding
  associado, é atribuição de VeriCore (auditores especialistas e/ou
  consolidador), não deste registrador.
- Este gate libera a prova dinâmica pendente em casos como `CASE-004`
  (`DYN-T03-07`), no que depende de o banco de teste estar íntegro e
  atualizado com `main`. Nenhuma decisão de achado, severidade ou status de
  auditoria é tomada por mim aqui.
