# ChatSalles - Migração para Node.js

O projeto original do Chatwoot foi copiado integralmente para esta pasta. O diretório original não é alterado.

## Estado atual

O backend novo está em [backend-node](./backend-node) e possui:

- Fastify + TypeScript;
- configuração por variáveis de ambiente;
- endpoint `GET /health`;
- endpoints iniciais para contas;
- endpoints iniciais para contatos;
- endpoints iniciais para regras de automação;
- suíte inicial de teste com Vitest.

## Estratégia incremental

O Rails continua preservado como referência funcional. Os módulos Node.js serão migrados progressivamente e, antes de cada substituição, deverão ter:

1. contrato HTTP compatível;
2. persistência PostgreSQL;
3. autorização e isolamento por conta;
4. jobs e eventos equivalentes;
5. testes de paridade;
6. observabilidade e tratamento de falhas.

Os endpoints atuais usam memória somente para validar a primeira camada da API. Eles não devem ser usados com dados reais até a implementação do repositório PostgreSQL e da autenticação.

## Próximo módulo

O próximo passo técnico é migrar autenticação, usuários, contas e autorização por tenant antes de conectar o frontend Vue ao backend Node.js.
