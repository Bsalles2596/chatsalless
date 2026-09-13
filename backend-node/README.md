# ChatSalles Node.js Backend

Backend novo do ChatSalles, desenvolvido em Node.js com TypeScript e Fastify.

## Estratégia

Este backend é uma migração incremental. O Rails original permanece preservado na raiz do projeto e continua sendo a referência funcional enquanto os módulos são substituídos.

## Frontend independente do Rails

O ChatSalles possui uma entrada SPA própria em `app/javascript/standalone`, servida diretamente pelo Vite. Essa execução não usa `vite-plugin-ruby`, Rails ou views ERB.

Inicie o backend e, em outro terminal, o frontend:

```bash
cd backend-node
pnpm dev

cd ..
pnpm dev:frontend
```

Abra `http://localhost:3000`. O login de desenvolvimento criado pelo seed é:

```text
admin@chatsalles.local
ChatSalles123!
```

O frontend consome o backend em `VITE_NODE_BACKEND_URL` (padrão `http://localhost:3001`) e já permite validar listagem, labels, prioridade, status, paginação e ordenação de conversas.

## Desenvolvimento

```bash
cd backend-node
pnpm install
pnpm dev
```

Endpoint inicial:

```text
GET http://localhost:3001/health
```

Módulos iniciais:

- `accounts`
- `contacts`
- `automation_rules`
- `conversations`
- `messages`

Os endpoints funcionam com PostgreSQL quando `DATABASE_URL` está configurado e usam memória apenas como fallback explícito para desenvolvimento e testes sem banco.

## PostgreSQL

Quando `DATABASE_URL` estiver definido, o módulo de contatos usa PostgreSQL automaticamente.

```bash
copy .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

A migration cria a tabela mínima `contacts` e índices por conta. Sem `DATABASE_URL`, o backend usa memória somente para desenvolvimento e testes locais.

O seed é idempotente e cria o usuário de desenvolvimento, uma inbox, uma equipe, três contatos, três conversas, mensagens e labels de demonstração:

```text
admin@chatsalles.local
ChatSalles123!
```

## API de contatos

Compatibilidade inicial com o frontend:

```text
GET    /api/v1/accounts/:accountId/contacts?page=1&q=term&sort=name
POST   /api/v1/accounts/:accountId/contacts
GET    /api/v1/accounts/:accountId/contacts/:id
PATCH  /api/v1/accounts/:accountId/contacts/:id
DELETE /api/v1/accounts/:accountId/contacts/:id
```

Sub-recursos disponíveis:

- busca e listagem paginada;
- edição e exclusão;
- labels;
- notas;
- conversas;
- importação CSV;
- exportação CSV.

## API de conversas e mensagens

Com um JWT válido, o módulo suporta:

```text
GET    /api/v1/accounts/:accountId/conversations?page=1&status=open
POST   /api/v1/accounts/:accountId/conversations
GET    /api/v1/accounts/:accountId/conversations/:id
PATCH  /api/v1/accounts/:accountId/conversations/:id
POST   /api/v1/accounts/:accountId/conversations/:id/toggle_status
POST   /api/v1/accounts/:accountId/conversations/:id/update_last_seen
POST   /api/v1/accounts/:accountId/conversations/:id/unread
DELETE /api/v1/accounts/:accountId/conversations/:id
GET    /api/v1/accounts/:accountId/conversations/:id/messages
POST   /api/v1/accounts/:accountId/conversations/:id/messages
GET    /api/v1/accounts/:accountId/conversations/:id/messages/:messageId/attachments/:attachmentId
DELETE /api/v1/accounts/:accountId/conversations/:id/messages/:messageId
POST   /api/v1/accounts/:accountId/conversations/:id/messages/:messageId/retry
GET    /api/v1/accounts/:accountId/conversations/unread_counts
GET    /api/v1/accounts/:accountId/conversations/search?q=term&page=1
GET    /api/v1/accounts/:accountId/conversations/:id/labels
POST   /api/v1/accounts/:accountId/conversations/:id/labels
```

A listagem aceita filtros combináveis:

```text
GET /api/v1/accounts/:accountId/conversations
  ?page=1
  &status=pending
  &inbox_id=<uuid>
  &team_id=<uuid>
  &assignee_id=<uuid>
  &assignee_type=user|team|unassigned
  &priority=0|1|2|3
```

O campo `meta.count` representa o total filtrado, independentemente da paginação atual.

Também são aceitos `q`, `labels`, `updated_within` (horas) e `sort_by` (`created_at`, `updated_at`, `priority` ou `alphabetical`).

Cada conversa e mensagem é validada pelo `accountId` do JWT. O armazenamento de anexos é abstraído por `AttachmentStorage`. O driver `bytea` mantém os arquivos no PostgreSQL para compatibilidade, enquanto `local` grava em `STORAGE_PATH`. A API permanece igual nos dois modos:

### Inventário de compatibilidade frontend

Com `VITE_NODE_BACKEND_RESOURCES=conversations`, os fluxos principais já estão cobertos:

- listagem e abertura de conversas;
- criação e alteração de status;
- leitura e não leitura;
- labels;
- exclusão de conversas;
- listagem, envio, retry e exclusão de mensagens;
- upload e download de anexos.

Os métodos do cliente Rails abaixo ainda não possuem paridade no Node:

- busca e filtros avançados;
- prioridade;
- atribuição de agente/equipe;
- typing status;
- mute/unmute;
- tradução;
- participantes;
- transcript por e-mail;
- solicitação de informações do contato;
- anexos legados no nível da conversa;
- inbox assistant.

Os modelos iniciais de `inboxes`, `agents`, `teams` e atribuições já estão disponíveis. A distribuição avançada ainda depende de regras de capacidade e permissões.

Esses recursos devem ser migrados junto com os modelos de domínio de inboxes, usuários, equipes, atribuições e permissões. Enquanto isso, não devem ser tratados como operações Node disponíveis.

```env
STORAGE_DRIVER=local
STORAGE_PATH=./storage/attachments
```

O driver local deve ser usado com volume persistente. O slice atual ainda não cobre canais, agentes/equipes, eventos em tempo real ou recebimento de mensagens de provedores externos.

Para AWS S3, MinIO ou outro serviço compatível:

```env
STORAGE_DRIVER=s3
S3_REGION=us-east-1
S3_BUCKET=chatsalles-attachments
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

Use `S3_ENDPOINT=http://localhost:9000` e `S3_FORCE_PATH_STYLE=true` em um MinIO local. Em AWS S3, deixe `S3_ENDPOINT` vazio e prefira credenciais fornecidas pelo ambiente, como IAM Role, em vez de gravá-las no arquivo `.env`.

O frontend local é ativado com `.env.local` na raiz do ChatSalles, apontando os recursos migrados em `VITE_NODE_BACKEND_RESOURCES`. Os demais módulos continuam no Rails durante a migração.
