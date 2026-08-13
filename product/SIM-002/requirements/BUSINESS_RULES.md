# SIM-002 "PagaFácil" — Regras de Negócio

Regras normativas do domínio de cadastro, aprovação e pagamento de fornecedores.
Este documento descreve **o que** o negócio exige, não como o software realiza.

---

## BR-SUP-001 — Pagamento exige fornecedor aprovado

Um fornecedor só pode receber pagamento quando estiver no status `approved`.
Fornecedores em qualquer outro status (por exemplo `pending` ou `rejected`) não
podem ser destinatários de pagamento.

## BR-SUP-002 — Unicidade de CNPJ

O CNPJ identifica univocamente um fornecedor no sistema. Não podem coexistir dois
fornecedores com o mesmo CNPJ, independentemente da empresa que os cadastrou.

## BR-APR-001 — Alçada de aprovação

A aprovação de um fornecedor está sujeita a alçada, determinada pelo limite de
crédito concedido:

| Limite de crédito aprovado | Papel exigido |
|---|---|
| Até R$ 10.000,00 (inclusive) | `analyst` ou `manager` |
| Acima de R$ 10.000,00 | `manager` |

Aprovações solicitadas por papel sem alçada suficiente devem ser recusadas.

## BR-PAY-001 — Teto de crédito do fornecedor

A soma dos pagamentos válidos de um fornecedor não pode, em nenhum momento,
exceder o limite de crédito aprovado para esse fornecedor.

## BR-PAY-002 — Idempotência de envio ao gateway

Um mesmo pagamento nunca pode ser enviado duas vezes ao gateway de pagamento.
Uma nova solicitação de envio para um pagamento já enviado deve reaproveitar o
envio anterior e a referência externa já obtida, sem produzir nova movimentação
financeira.

## BR-SEC-001 — Isolamento por empresa

Um usuário só pode acessar fornecedores e pagamentos pertencentes à sua própria
empresa (`company_id`). Dados de outras empresas não podem ser lidos nem
alterados.

---

As regras abaixo transcrevem decisões humanas registradas em
`coretriad/governance/APPROVALS.md`. Não são interpretação da SanaCore: cada uma
cita a aprovação que a originou (Regras 6, 17 e 18 do `CLAUDE.md`).

## BR-PAY-003 — Cancelamento só antes do envio (origem: APR-2026-007)

Um pagamento só pode ser cancelado enquanto estiver em `created`, isto é, antes
do envio ao gateway. **Não existe cancelamento de pagamento já enviado**:
reverter um envio efetivado é **estorno**, operação distinta e fora do escopo do
SIM-002. Toda tentativa de cancelar pagamento em `sent` deve ser recusada, e o
fato do envio (status, referência externa e instante) permanece intacto.

O cancelamento é operação de escrita com sujeito e sujeita a BR-SEC-001.

**Lacuna normativa conhecida:** APR-2026-007 não arbitrou papel específico para
o cancelamento; hoje exige-se usuário autenticado da empresa proprietária.

## BR-SEC-002 — Papel e empresa vêm do servidor (origem: APR-2026-008)

O papel e a empresa do usuário são atributos do servidor, resolvidos a cada
operação em fonte confiável de identidade (tabela `users`). Papel ou empresa
declarados pelo cliente não têm efeito algum. Identificador sem correspondência
na fonte de identidade é falha de autenticação.

Matriz de autorização de pagamentos:

| Operação | Natureza | Papel exigido |
|---|---|---|
| Registrar pagamento | escrita | `manager` |
| Enviar pagamento ao gateway | escrita | `manager` |
| Consultar fornecedor | leitura | `analyst` ou `manager` |
| Listar pagamentos | leitura | `analyst` ou `manager` |

Vínculo normativo: Regra 24 do `CLAUDE.md` (papel autodeclarado pelo cliente é
defeito de autorização, nunca risco aceito em produção).

## BR-PAY-004 — Recusa do gateway (origem: APR-2026-009)

Quando o gateway recusa a submissão, o pagamento assume o estado `failed` —
jamais `sent`. A recusa é causa distinta de cancelamento e deve ser rastreável
separadamente: a tentativa fica registrada com resultado `failed` e o pagamento
não conta como enviado (sem referência externa e sem instante de envio). Um
pagamento em `failed` permanece elegível a nova tentativa de envio.
