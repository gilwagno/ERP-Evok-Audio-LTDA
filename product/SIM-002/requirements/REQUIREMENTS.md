# SIM-002 "PagaFácil" — Requisitos

Rastreabilidade: REQ → BR → AC → TC.

---

## REQ-SIM2-001 — Cadastrar fornecedor

O sistema deve permitir que um usuário autenticado cadastre um fornecedor
informando `cnpj` e `name`. O fornecedor é sempre criado na empresa do usuário
(`user.companyId`), recebe identificador único e status inicial `pending`.

- **BRs relacionadas:** BR-SUP-002 (unicidade de CNPJ), BR-SEC-001 (isolamento
  por empresa, também na escrita)
- **AC-SIM2-001:** Dado um CNPJ ainda não cadastrado, quando um usuário
  autenticado cadastra o fornecedor com `cnpj` e `name` válidos, então o
  fornecedor é criado com `id` único, `company_id` igual a `user.companyId`,
  status `pending` e `credit_limit` igual a `0`. Dado um CNPJ já existente no
  sistema, então o cadastro é recusado. Dado um `companyId` informado diferente
  de `user.companyId`, então o cadastro é recusado e nenhum registro é criado na
  outra empresa. Dada uma chamada sem usuário, então o cadastro é recusado —
  não há escrita sem sujeito.
- **TC planejado:** TC-SIM2-001, TC-SIM2-001c, TC-SIM2-001d, TC-SIM2-001e

## REQ-SIM2-002 — Aprovar fornecedor com alçada

O sistema deve permitir aprovar um fornecedor, concedendo-lhe um limite de
crédito, desde que o aprovador possua alçada compatível com o valor concedido.

- **BRs relacionadas:** BR-APR-001 (alçada), BR-SEC-001 (isolamento por empresa)
- **AC-SIM2-002:** Dado um fornecedor `pending` da mesma empresa do aprovador,
  quando um `analyst` aprova com limite dentro da sua alçada, então o fornecedor
  passa a `approved` com o limite concedido. Quando o limite excede a alçada do
  `analyst`, então a aprovação é recusada e o fornecedor permanece `pending`.
  Quando um `manager` aprova, qualquer limite dentro da política é aceito.
- **TC planejado:** TC-SIM2-002

## REQ-SIM2-003 — Criar pagamento

O sistema deve permitir criar um pagamento para um fornecedor aprovado,
respeitando o teto de crédito concedido.

- **BRs relacionadas:** BR-SUP-001 (fornecedor aprovado), BR-PAY-001 (teto de
  crédito), BR-SEC-001 (isolamento por empresa), BR-SEC-002 (papel `manager`
  resolvido no servidor)
- **AC-SIM2-003:** Dado um fornecedor `approved` da empresa do usuário, quando é
  criado um pagamento de valor positivo cuja soma com os pagamentos existentes
  não excede o limite de crédito, então o pagamento é registrado com status
  `created`. Dado um fornecedor não aprovado, então a criação é recusada. Dado
  que a soma excederia o limite de crédito, então a criação é recusada.
- **TC planejado:** TC-SIM2-003

## REQ-SIM2-004 — Enviar pagamento ao gateway

O sistema deve permitir enviar um pagamento registrado ao gateway externo,
armazenando a referência externa retornada e registrando a tentativa.

- **BRs relacionadas:** BR-PAY-002 (idempotência de envio), BR-PAY-004 (recusa
  do gateway), BR-SEC-002 (papel `manager` resolvido no servidor)
- **AC-SIM2-004:** Dado um pagamento com status `created`, quando ele é enviado
  ao gateway por um `manager` da empresa proprietária, então o pagamento passa a
  `sent`, recebe `external_ref` e a tentativa é registrada. Dado um pagamento já
  enviado, quando o envio é solicitado novamente, então o envio anterior é
  reaproveitado e nenhuma nova movimentação é gerada no gateway.
- **AC-SIM2-004b (BR-PAY-004):** Dado um pagamento em `created`, quando o
  gateway recusa a submissão, então o pagamento passa a `failed`, permanece sem
  `external_ref` e sem `sent_at`, e a tentativa é registrada com resultado
  `failed`. O pagamento não conta como enviado e continua elegível a nova
  tentativa.
- **TC planejado:** TC-SIM2-004, TC-SIM2-009a, TC-SIM2-009b

## REQ-SIM2-005 — Listar pagamentos por fornecedor

O sistema deve listar os pagamentos de um fornecedor, respeitando o isolamento
por empresa.

- **BRs relacionadas:** BR-SEC-001
- **AC-SIM2-005:** Dado um usuário da empresa proprietária do fornecedor, quando
  ele lista os pagamentos daquele fornecedor, então recebe todos os pagamentos
  do fornecedor, ordenados por data de criação. Dado um usuário de outra
  empresa, então a listagem é recusada com erro genérico
  (`Fornecedor não encontrado`) e nenhum dado da outra empresa é devolvido. Em
  toda listagem bem-sucedida, todo item satisfaz
  `item.company_id === user.companyId`.
- **TC planejado:** TC-SIM2-005, TC-SIM2-005b, TC-SIM2-005c

## REQ-SIM2-006 — Consultar fornecedor

O sistema deve permitir consultar os dados cadastrais e o limite de crédito de um
fornecedor da própria empresa.

- **BRs relacionadas:** BR-SEC-001
- **AC-SIM2-006:** Dado um usuário da mesma empresa do fornecedor, quando ele
  consulta o fornecedor, então recebe `id`, `cnpj`, `name`, `status`,
  `credit_limit` e `company_id`. Dado um usuário de outra empresa, então a
  consulta é recusada.
- **TC planejado:** TC-SIM2-006

## REQ-SIM2-007 — Cancelar pagamento não enviado

O sistema deve permitir cancelar um pagamento ainda não enviado ao gateway,
identificando o sujeito da operação. Requisito criado na remediação WAVE-D para
dar origem documental a comportamento que já existia em código sem requisito
(FIND-SIM-002-004), com a semântica fixada por APR-2026-007.

- **BRs relacionadas:** BR-PAY-003 (cancelamento só antes do envio),
  BR-SEC-001 (isolamento por empresa), BR-SEC-002 (sujeito resolvido no servidor)
- **AC-SIM2-007:** Dado um pagamento em `created` da empresa do usuário, quando o
  cancelamento é solicitado por usuário autenticado dessa empresa, então o
  pagamento passa a `cancelled`. Dado um pagamento em `sent`, então o
  cancelamento é recusado e status, `external_ref` e `sent_at` permanecem
  inalterados. Dado um pagamento de outra empresa, então a operação é recusada
  com erro genérico (`Pagamento não encontrado`). Dada uma chamada sem sujeito,
  então é recusada.
- **TC planejado:** TC-SIM2-007a, TC-SIM2-007b, TC-SIM2-007c, TC-SIM2-007d

## REQ-SIM2-008 — Autorização por papel com identidade do servidor

O sistema deve resolver papel e empresa do usuário em fonte confiável de
identidade e aplicar a matriz de autorização de BR-SEC-002 em leituras e
escritas. Requisito criado na remediação WAVE-D (FIND-SIM-002-008-A + OBS-002,
decisão APR-2026-008).

- **BRs relacionadas:** BR-SEC-002, BR-SEC-001
- **AC-SIM2-008:** Dado um usuário cujo papel gravado é `analyst`, quando ele
  tenta registrar ou enviar pagamento, então a operação é recusada — mesmo que o
  payload declare `manager`. Dado um `manager` da empresa, então as duas
  operações são permitidas. Dado `analyst` ou `manager`, então a consulta de
  fornecedor e a listagem de pagamentos da própria empresa são permitidas. Dado
  um identificador inexistente na fonte de identidade, então a operação é
  recusada como falha de autenticação.
- **TC planejado:** TC-SIM2-008a .. TC-SIM2-008g
