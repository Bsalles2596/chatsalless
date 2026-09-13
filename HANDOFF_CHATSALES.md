# ChatSalles - Documento de continuidade

Este documento registra o estado da migração do Chatwoot para o ChatSalles,
com backend Node.js e frontend SPA independente do Ruby/Rails.

## Objetivo original

Criar uma cópia independente chamada ChatSalles, preservando o projeto
original e substituindo progressivamente o backend Ruby/Rails por Node.js.
O objetivo final é executar o produto sem depender de Ruby ou Rails.

Projeto de trabalho:

```text
C:\Users\SALLES\Downloads\ChatSalles
```

O projeto original não deve ser alterado.

O diretório agora possui um repositório Git local próprio (`.git`). Arquivos
de ambiente e secrets locais, incluindo `.env.production`, permanecem
ignorados pelo versionamento.

## Resumo executivo atualizado

O ChatSalles está funcional como uma migração incremental avançada para
homologação, com backend Node.js, SPA independente, PostgreSQL, Redis, BullMQ,
Socket.IO e observabilidade. O objetivo final de paridade completa com o
Chatwoot e remoção total do backend Ruby/Rails ainda não foi concluído.

### Critérios atendidos

- projeto original preservado;
- pasta independente `ChatSalles`;
- fluxo standalone sem Ruby/Rails;
- autenticação JWT e isolamento por conta;
- contatos, conversas, mensagens, automações e webhooks;
- duas APIs com Socket.IO e Redis Adapter;
- Prometheus, Grafana, Redis Exporter e Alertmanager;
- failover manual de Redis, worker e API validado;
- secrets de produção e override Docker preparados.

### Pendências bloqueadoras para produção

- configurar o endpoint real do Alertmanager;
- substituir todos os secrets e remover o usuário demo;
- configurar TLS e reverse proxy;
- completar os módulos e integrações ainda ausentes do Chatwoot;
- definir backup externo e política de retenção.

### Estado dos testes Redis

- Socket.IO multi-instância com Redis: aprovado, 2 testes;
- BullMQ/webhooks com Redis: aprovado, 3 testes;
- a execução real validou HTTP 429, HTTP 503, timeout, retry, backoff e
  dead-letter;
- filas de teste usam `BULLMQ_QUEUE_PREFIX` para não compartilhar jobs com um
  worker permanente de Compose.

## Estado atual

Funcionando:

- Backend Node.js com TypeScript, Fastify e PostgreSQL.
- Autenticação JWT multi-tenant.
- Contatos: listar, buscar, criar, editar e excluir.
- Conversas: listar, filtrar, criar e alterar status.
- Mensagens: listar, enviar, excluir e retry.
- Labels de contatos e conversas.
- Prioridade de conversas.
- Atribuição para agentes e equipes.
- Upload e download de anexos.
- Storage `bytea`, local e S3 compatível.
- Frontend SPA independente do Rails.
- Login, conversas, mensagens e contatos no frontend Node.
- Seed idempotente com dados de demonstração.
- Testes backend e testes iniciais da SPA.
- Testes da SPA para notas privadas, upload via `FormData`, leitura/não leitura,
  retry e exclusão de mensagens/conversas.
- Cliente HTTP standalone extraído para `app/javascript/standalone/api.js`.
- Alteração de inbox implementada na API e na SPA.
- Mensagens visuais de sucesso adicionadas para ações operacionais.
- Testes da SPA ampliados para filtros combinados, paginação, inbox e contatos.
- Payload de listagem de conversas enriquecido com dados relacionados.
- `updated_at` real para conversas e atualização nas mutações principais.
- SPA exibe nome do contato, labels, não lidas, inbox, agente e equipe.
- Teste de integração valida campos essenciais do payload enriquecido.
- SPA permite marcar conversa como lida/não lida, excluir conversa, retry de
  mensagens, anexar arquivo e enviar nota privada.
- SPA permite remover atribuição de agente/equipe.

## Como iniciar

### Banco

PostgreSQL deve estar ativo na porta 5432 com o banco `chatsalles`.

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles\backend-node
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chatsalles'
pnpm db:migrate
pnpm db:seed
```

### Backend Node

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles\backend-node
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chatsalles'
pnpm dev
```

Backend:

```text
http://localhost:3001
http://localhost:3001/health
```

### Frontend independente

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles
$env:VITE_NODE_BACKEND_URL='http://localhost:3001'
pnpm dev:frontend
```

Frontend:

```text
http://localhost:3000
```

Administrador inicial:

```text
CHATSALES_ADMIN_EMAIL=admin@chatsalles.com.br
CHATSALES_ADMIN_PASSWORD=<defina uma senha forte com pelo menos 16 caracteres>
```

O seed não contém mais uma senha fixa. Antes de executar `pnpm db:seed`,
defina essas duas variáveis apenas na sessão local ou no secret manager:

```powershell
$env:CHATSALES_ADMIN_EMAIL='admin@chatsalles.com.br'
$env:CHATSALES_ADMIN_PASSWORD='<senha forte>'
pnpm db:seed
```

Não é necessário iniciar Rails, Ruby, Bundler ou `vite-plugin-ruby` para a SPA
independente.

## Arquivos principais

- `backend-node/src/app.ts`: composição do Fastify.
- `backend-node/src/db/migrate.ts`: schema PostgreSQL.
- `backend-node/src/db/seed.ts`: dados de demonstração.
- `backend-node/src/modules/auth/auth.routes.ts`: login e usuário atual.
- `backend-node/src/modules/contacts/contacts.routes.ts`: API de contatos.
- `backend-node/src/modules/conversations/conversations.routes.ts`: API de conversas,
  mensagens, labels, anexos, status, prioridade e atribuição.
- `backend-node/src/modules/operations/operations.routes.ts`: inboxes, agentes,
  equipes e membros.
- `backend-node/src/shared/storage/attachmentStorage.ts`: storage de anexos.
- `app/javascript/standalone/main.js`: SPA Node atual.
- `app/javascript/standalone/style.css`: estilos da SPA.
- `app/javascript/standalone/main.spec.js`: testes atuais da SPA.
- `vite.config.ts`: Vite sem dependência do plugin Ruby no fluxo standalone.
- `index.html`: entrada da SPA independente.

## Validações já executadas

Backend:

```text
4 test files passed
5 tests passed
TypeScript build passou
```

Frontend:

```text
SPA tests: 2 tests passed
Vite production build: passou
```

Seed:

```text
Executado duas vezes sem duplicar os dados principais.
```

Navegador:

```text
Login funcionando.
Conversas de demonstração carregadas.
Tela de contatos carregada.
Modal de criação e edição de contato validado.
Filtros e ações da conversa implementados.
```

## O que ainda não está concluído

### Paridade da resposta de conversas

A listagem agora retorna diretamente, em uma consulta única:

- `contact_name`;
- labels;
- `updated_at` real;
- `unread_count`;
- nome/e-mail do agente;
- nome da equipe;
- inbox;
- dados completos do contato.

O frontend standalone ainda pode ser refinado para exibir todos esses campos
com mais detalhes, mas a API já fornece os dados relacionados.

### Modelo de atualização

A tabela `conversations` agora possui `updated_at` real. O campo é atualizado
quando ocorre:

- nova mensagem;
- alteração de status;
- alteração de prioridade;
- alteração de atribuição;
- alteração de labels;

Filtros `updated_within` e ordenação `updated_at` agora usam esse campo.

### Ações operacionais restantes

Ainda devem ser adicionados ou refinados:

- alterar inbox pela SPA;
- mensagens de sucesso/erro mais claras;
- cobertura de edição/exclusão de contatos e criação de conversa.

### Organização do frontend

O arquivo `app/javascript/standalone/main.js` ainda concentra estado e template.
O cliente HTTP já foi extraído para `api.js`; a separação das views e
componentes deve continuar sem alterar comportamento:

```text
app/javascript/standalone/
├── main.js
├── api.js
├── views/
│   ├── LoginView.js
│   ├── ConversationsView.js
│   └── ContactsView.js
├── components/
│   ├── ConversationList.js
│   ├── MessagePanel.js
│   └── ContactForm.js
└── style.css
```

### Testes da SPA

Os testes atuais cobrem login, carregamento, criação de contato e as ações
operacionais principais.
Adicionar cobertura para:

- edição e exclusão;
- criação de conversa;
- envio de mensagem;
- alteração de status;
- prioridade;
- labels;
- atribuição;
- paginação;
- filtros combinados;
- retry;
- anexos;
- logout e expiração do token.

### Tempo real

Depois de estabilizar HTTP:

- adicionar WebSocket ou Socket.IO;
- emitir eventos de nova mensagem;
- atualizar status e atribuição em tempo real;
- atualizar contadores de não lidas;
- adicionar reconexão.

### Produção

Antes de produção:

- validar S3 ou MinIO real;
- usar bucket privado;
- gerar URLs assinadas;
- configurar limites por tenant;
- adicionar limpeza de anexos;
- configurar Redis/BullMQ;
- implementar retry assíncrono real;
- adicionar rate limiting;
- revisar permissões por função;
- configurar observabilidade;
- remover credenciais de desenvolvimento;
- criar deploy do backend e frontend.

## Ordem recomendada para continuar

1. Adicionar testes de integração específicos para payload enriquecido e `updated_at`.
2. Testar Socket.IO com dois clientes autenticados e validar isolamento por
   tenant.
3. Implementar Redis/BullMQ para eventos, automações e retry assíncrono.
6. Validar storage S3/MinIO real.
7. Migrar os módulos restantes do frontend.
8. Fazer revisão de segurança, performance e autorização.
9. Preparar build/deploy independente sem Ruby.

## Comandos de validação

```powershell
# Backend
cd C:\Users\SALLES\Downloads\ChatSalles\backend-node
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chatsalles'
pnpm test
pnpm build

# Frontend SPA
cd C:\Users\SALLES\Downloads\ChatSalles
pnpm exec vitest run app/javascript/standalone/main.spec.js --no-cache
pnpm exec vite build
```

## Observações importantes

- O Rails original foi preservado e não deve ser reescrito.
- A execução standalone usa `pnpm dev:frontend` e não `pnpm start:dev`.
- `pnpm start:dev` continua sendo o fluxo antigo dependente de Foreman/Rails.
- O backend Node atual usa PostgreSQL real quando `DATABASE_URL` está definido.
- O seed é seguro para execução repetida, mas novos dados manuais podem permanecer.
- O lint do backend ainda não está configurado porque ESLint/configuração não
  estão declarados no pacote `backend-node`.
- Redis/BullMQ e S3 real ainda não foram configurados.

## Ponto exato de retomada

O último trabalho concluído foi:

1. seed idempotente com dados demonstrativos;
2. testes iniciais da SPA;
3. build frontend;
4. testes backend;
5. validação visual com quatro conversas de demonstração;
6. payload de conversas enriquecido e `updated_at` real;
7. filtros e ordenação atualizados para usar `updated_at`.
8. SPA exibindo os dados relacionados da conversa;
9. teste de integração cobrindo os campos essenciais do payload.
10. ações operacionais principais adicionadas à SPA.
11. remoção de atribuição adicionada à SPA.
12. cliente HTTP extraído para `app/javascript/standalone/api.js`.
13. testes da SPA ampliados para quatro casos, incluindo `FormData`, notas
    privadas, leitura/não leitura, retry e exclusão.
14. `pnpm exec vitest run app/javascript/standalone/main.spec.js --no-cache`
    passou com 7 testes.
15. `pnpm exec vite build` passou.
16. Endpoint `POST /conversations/:conversationId/inbox` adicionado com
    validação de tenant e inbox.
17. SPA passou a carregar inboxes e permitir alterar a inbox da conversa.
18. SPA passou a exibir confirmações visuais de sucesso.
19. Template ativo da SPA foi dividido em `views/LoginView.js`,
    `views/ConversationsView.js`, `views/ContactsView.js`,
    `components/ConversationList.js`, `components/MessagePanel.js` e
    `components/ContactForm.js`.
20. A composição modular passou nos 7 testes da SPA e no build Vite.
21. Os fragmentos foram convertidos em componentes Vue reais com `props` e
    `emits`; o `legacyTemplate` foi removido da composição da aplicação.
22. Foram criados testes unitários para lista de conversas, formulário de
    contato e painel de mensagens.
23. A suíte frontend passou com 10 testes e o build Vite passou novamente.
24. Socket.IO foi integrado em `backend-node/src/realtime/realtime.ts` com
    autenticação JWT e salas por conta/conversa.
25. O backend emite eventos de novas mensagens, retry, exclusão, status,
    prioridade, atribuição e inbox.
26. A SPA conecta ao Socket.IO, assina a conversa selecionada, atualiza o
    painel/lista em tempo real e mantém reconexão/fallback HTTP.
27. Eventos de leitura/não leitura foram adicionados com `unreadCount`.
28. Teste de integração Socket.IO usa dois clientes JWT e confirma que eventos
    de uma conta não chegam à outra.
29. A suíte backend passou com 7 testes, a suíte frontend com 10 testes e os
    builds Vite/TypeScript passaram.
30. O teste Socket.IO passou a chamar os endpoints HTTP reais de `unread` e
    `update_last_seen`, validando eventos com `unreadCount` 1 e 0.
31. A suíte backend passou com 8 testes; a suíte frontend passou com 11 testes.
32. Foi adicionado teste HTTP → Socket.IO para criação de mensagem, status,
    prioridade, atribuição e alteração de inbox.
33. A rota de inbox foi corrigida para ser registrada no escopo correto do
    plugin, evitando registro tardio dentro do handler de atribuições.
34. Criação de regra de automação autenticada passou a emitir
    `automation:created`; o fluxo foi coberto por integração Socket.IO.
35. A suíte backend passou com 10 testes e o build TypeScript passou; a suíte
    frontend passou com 11 testes e o build Vite passou.
36. Regras de automação passaram a ser persistidas na tabela PostgreSQL
    `automation_rules`, com índice por conta/evento/estado.
37. A criação e listagem autenticadas de regras usam o `accountId` do JWT,
    validam entrada com Zod e emitem `automation:created` somente após a
    persistência.
38. O teste realtime cobre a criação persistida da automação; a suíte
    realtime passou com 5 testes e o build TypeScript passou.
39. Regras de automação agora suportam atualização parcial, exclusão e
    ativação/desativação, sempre limitadas à conta autenticada.
40. Foi criado `automation.service.ts` com condições `equals`, `not_equals`,
    `contains` e `exists`, além das ações `set_status`, `set_priority` e
    `add_label`.
41. Foi criado o histórico `automation_executions` com deduplicação por
    `(rule_id, event_id)`, estados de execução e limite de profundidade para
    evitar recursão infinita.
42. A criação de mensagens dispara automações `message.created`; resultados
    emitem `automation:executed` e ficam disponíveis em
    `GET /api/v1/accounts/:accountId/automation_executions`.
43. Foram adicionados testes de CRUD de regras; a suíte realtime passou com
    6 testes e o build TypeScript passou.
44. O executor passou a ser disparado pelas rotas reais de alteração de
    status, prioridade, atribuição, inbox e leitura/não leitura, além de
    criação de mensagens.
45. A rota PATCH principal de conversas também emite o evento de status e
    dispara automações.
46. Foi adicionado teste de execução real das ações `set_status`,
    `set_priority` e `add_label`, incluindo deduplicação pelo mesmo
    `event_id`; a suíte realtime passou com 7 testes.
47. Foi criado o módulo de webhooks com endpoints persistidos por conta,
    eventos configuráveis, ativação e segredo HMAC gerado no cadastro.
48. Entregas usam assinatura `sha256`, timeout de 5 segundos, histórico em
    `webhook_deliveries`, até 4 tentativas e backoff exponencial limitado.
49. Entregas bem-sucedidas, em retry e falhas emitem eventos realtime
    `webhook:delivery_succeeded`, `webhook:delivery_retrying` e
    `webhook:delivery_failed`.
50. Eventos processados pelo executor de automações também são encaminhados
    aos webhooks configurados da conta, sem bloquear a resposta HTTP.
51. Foram adicionadas rotas para criar/listar endpoints e consultar entregas,
    além de teste que valida persistência, assinatura HMAC e sucesso HTTP.
52. Webhooks agora suportam atualização, exclusão e rotação de segredo,
    sempre com escopo da conta autenticada.
53. BullMQ e ioredis foram adicionados; com `REDIS_URL`, entregas entram na
    fila persistente `chatsalles-webhooks` com backoff exponencial.
54. Foi criado worker separado para processar entregas e uma fila
    `chatsalles-webhooks-dead-letter` para jobs esgotados.
55. Sem `REDIS_URL`, o modo local continua funcionando com o fallback HTTP e
    timers existentes; com Redis, o retry passa a ser responsabilidade do
    worker BullMQ.
56. O Socket.IO usa Redis Adapter quando `REDIS_URL` está configurada,
    permitindo eventos entre múltiplas instâncias.
57. A suíte backend passou com 6 arquivos e 14 testes; o build TypeScript
    passou após a integração de BullMQ, Redis e adapter.
58. Foi corrigida a regra de dead-letter para encaminhar somente jobs que
    esgotaram todas as tentativas do BullMQ, não falhas intermediárias.
59. Foi adicionado reprocessamento manual por
    `POST /api/v1/accounts/:accountId/webhooks/deliveries/:deliveryId/retry`,
    além de métricas básicas da fila em `GET .../webhooks/queue-metrics`.
60. Foi criado `worker-main.ts` para execução independente do worker e
    `docker-compose.chatsalles.yml` com PostgreSQL, Redis, API e worker.
61. O teste de retry manual foi adicionado; a suíte backend passou com
    6 arquivos e 15 testes.
62. Docker Desktop foi instalado no Windows e validado com Docker 29.7.2 e
    Docker Compose v5.5.1.
63. `docker-compose.chatsalles.yml` foi validado e corrigido para os caminhos
    reais gerados pelo TypeScript (`dist/src/...`).
64. A stack Docker foi iniciada com PostgreSQL 17, Redis 7, API e worker;
    PostgreSQL e Redis ficaram saudáveis e `GET /health` retornou HTTP 200.
65. Foi adicionado reprocessamento manual de entregas e métricas básicas da
    fila; testes de webhook cobrem criação, assinatura, CRUD e retry manual.
66. Foram criadas as telas administrativas `AutomationAdminView.js` e
    `WebhookAdminView.js`, integradas à SPA para listar, criar, ativar,
    desativar, rotacionar, excluir e reprocessar itens.
67. A SPA continua compatível com os fluxos existentes: 2 arquivos de teste,
    13 testes passando, e build Vite concluído.
68. As telas administrativas passaram a usar componentes Vue com `props` e
    `emits` explícitos para filtros, paginação e formulários estruturados.
69. A criação de automações agora aceita condições e ações em JSON, com
    validação de parsing no frontend antes do envio.
70. A validação regressiva passou: backend com 6 arquivos e 15 testes,
    frontend com 13 testes e build Vite concluído.
71. Foi exposta a porta `6379` no Compose para permitir integração do host
    com o Redis local.
72. Foi criada a suíte `backend-node/tests/webhooks.redis.integration.test.ts`,
    que inicia o worker BullMQ real e valida HTTP 429, HTTP 503, timeout,
    retry com backoff e dead-letter usando Redis e PostgreSQL reais.
73. Foi criada a suíte
    `backend-node/tests/realtime.redis.integration.test.ts`, que inicia duas
    instâncias Fastify/Socket.IO, conecta clientes em portas diferentes e
    confirma propagação entre instâncias via Redis Adapter e isolamento por
    conta.
74. Os testes Redis passaram: 3 cenários de webhook e 2 cenários de
    Socket.IO. A regressão sem Redis também passou com 15 testes, e o build
    TypeScript e `docker compose config` foram concluídos com sucesso.
75. Foram adicionados controles de produção para webhooks: validação de HTTPS
    e resolução DNS anti-SSRF em produção, rejeição de credenciais embutidas na
    URL e criptografia AES-256-GCM dos segredos em repouso.
76. Rotas administrativas de webhook passaram a exigir o papel `admin`;
    usuários receberam a coluna `role`, o login inclui esse papel no JWT e foi
    adicionado rate limiting por IP e rota.
77. O worker agora expõe métricas básicas de processamento, sucesso, falha e
    retry. Também foi adicionada a rota protegida para reprocessar jobs da
    dead-letter queue.
78. O Compose passou a incluir `chatsalles-api-2` na porta 3002. A stack foi
    reconstruída e as duas APIs responderam HTTP 200 em `/health`, com
    PostgreSQL, Redis e worker saudáveis.
79. O rate limiting foi migrado para contador atômico Redis (`INCR`/`PEXPIRE`/
    `PTTL`), mantendo fallback local explícito quando Redis não está configurado.
80. Foram adicionados testes para criptografia/compatibilidade de segredos,
    rejeição de credenciais em URLs, permissões admin, rate limiting distribuído
    e isolamento de reprocessamento da dead-letter.
81. Em produção, a aplicação agora falha ao iniciar se
    `WEBHOOK_ENCRYPTION_KEY` não substituir a chave padrão de desenvolvimento.
82. A suíte de controles de segurança passou com cobertura de criptografia,
    credenciais em URL, autorização admin, rate limiting Redis e dead-letter.
    A regressão backend passou com 7 arquivos e 18 testes (2 suítes Redis
    condicionais ignoradas sem `REDIS_URL`), e o build TypeScript passou.
83. Foi adicionado o teste HTTP
    `backend-node/tests/rate-limit.http.integration.test.ts`, que inicia duas
    APIs Fastify em portas distintas e alterna requisições entre elas. Com o
    mesmo Redis, a janela compartilhada retornou HTTP 429 exatamente após o
    limite configurado.
84. Os testes anti-SSRF agora cobrem endereços privados IPv4, loopback,
    link-local e IPv6, além de credenciais embutidas em URL. A validação
    específica Redis passou com 2 arquivos e 7 testes.
85. A regressão sem Redis passou com 7 arquivos e 19 testes; 3 suítes de
    integração Redis foram corretamente ignoradas sem `REDIS_URL`. A stack
    Docker multi-API permaneceu ativa com APIs nas portas 3001/3002, Redis,
    PostgreSQL saudável e worker em execução.
86. Foi criado o painel operacional de webhooks na `WebhookAdminView.js`, com
    contadores do worker, jobs pendentes/ativos/atrasados, dead-letter,
    atualização automática de 10 segundos e reprocessamento protegido.
87. A API passou a expor métricas de fila incluindo dead-letter e uma listagem
    filtrável por evento que redige URL, segredo e payload dos jobs antes de
    responder ao administrador.
88. A ação de reprocessamento da SPA usa a rota protegida por conta e papel
    administrativo. Build frontend, build TypeScript e regressões direcionadas
    passaram: frontend 13 testes, backend direcionado 7 testes e build Vite.
89. Foi adicionada persistência de logs estruturados JSONL por API e worker,
    configurável via `LOG_FILE_PATH`, com volumes Docker dedicados para não
    perder os arquivos durante recriações dos containers.
90. Foi adicionado o endpoint externo `/metrics` em formato Prometheus, com
    contadores HTTP, soma/quantidade de duração e métricas de jobs BullMQ.
    A suíte de observabilidade passou com 3 testes e o build TypeScript passou.
91. O rate limiting ganhou `commandTimeout` Redis de 1 segundo e fallback local
    quando o Redis fica indisponível. Na simulação Docker, as duas APIs
    responderam HTTP 200 com Redis parado e voltaram a usar Redis após o
    restabelecimento.
92. Foi validado reinício do worker, falha temporária da API 1 com API 2
    disponível e carga básica de 100 requisições: 100 respostas HTTP 200 em
    aproximadamente 3,1 segundos. O endpoint `/metrics` respondeu 200 e o
    arquivo JSONL persistente foi confirmado dentro do container.
93. Foi criado o smoke/load test reproduzível
    `backend-node/scripts/load-smoke.mjs`, com concorrência configurável,
    cálculo de p50/p95/p99, limite de erro e código de saída não-zero quando
    os limiares não são atendidos. O comando foi adicionado como
    `pnpm load:smoke`.
94. Foi criado o checklist operacional
    `DEPLOY_CHECKLIST_CHATSALES.md`, cobrindo secrets, rede, migrações,
    anti-SSRF, observabilidade, failover, rollback e validação final.
95. O comando `pnpm load:smoke` foi validado com 100 requisições e
    concorrência 25: 0% de erros, p50 57,87 ms, p95 105,47 ms, p99
    114,52 ms e duração total de 310,99 ms.
96. Uma execução de 500 requisições foi bloqueada pelo rate limiting padrão de
    120, com 76% de respostas rejeitadas e p95 332,51 ms. Isso confirmou que
    o limite operacional está ativo; cargas maiores devem usar cenário e limite
    explicitamente configurados.
97. O Compose passou a incluir Prometheus e Grafana para homologação:
    Prometheus coleta `/metrics` das duas APIs a cada 15 segundos e Grafana é
    publicado na porta local 3003. As credenciais padrão do Grafana devem ser
    substituídas por variáveis de ambiente antes de qualquer uso produtivo.
98. Prometheus e Grafana foram iniciados e validados: ambos responderam HTTP
    200, o endpoint `/metrics` respondeu em HTTP 200 e os targets
    `chatsalles-api:3001` e `chatsalles-api-2:3002` ficaram com estado `up`.
99. Foram adicionadas regras Prometheus em `monitoring/alerts.yml` para API
    indisponível, HTTP 5xx, HTTP 429, falhas do worker e dead-letter. O worker
    passou a publicar também a métrica `dead_letter` quando a entrega é
    efetivamente movida para a fila de dead-letter.
100. O Grafana passou a provisionar automaticamente o datasource Prometheus e
     o dashboard `ChatSalles Overview`, com taxa HTTP, proporções 5xx/429 e
     resultados do worker. O dashboard foi validado pela API do Grafana.
101. Redis Exporter foi adicionado ao Compose sem publicar sua porta no host.
     Prometheus coleta `redis_up` e possui alertas separados para Redis
     indisponível e Redis Exporter indisponível.
102. Foi criada uma sobreposição de produção em
     `docker-compose.production.yml`: secrets passam a ser obrigatórios,
     `NODE_ENV=production` é aplicado e Redis, Prometheus e Grafana deixam de
     ser publicados no host. O arquivo `.env.production.example` documenta as
     variáveis necessárias.
103. Alertmanager foi adicionado ao Compose e o Prometheus passou a encaminhar
     alertas para ele. O receiver contém um endpoint local de exemplo e deve
     ser substituído diretamente em `monitoring/alertmanager.yml` antes da
     produção.
104. Foi criado `scripts/failover-smoke.ps1`, que valida parada/retomada do
     Redis, fallback das APIs, reinício do worker e disponibilidade da API 2
     durante a parada temporária da API 1. O teste usa os IDs resolvidos pelo
     Compose e restaura os serviços parados em blocos `finally`.
105. O smoke test de failover foi executado com sucesso. Redis foi parado e
     retomado, o worker foi reiniciado e a API 2 permaneceu disponível enquanto
     o container da API 1 estava parado. Respostas 429 foram tratadas como
     endpoint alcançável, pois o rate limit já estava ativo no ambiente.
106. Foram criados `scripts/backup-postgres.ps1` e
     `scripts/restore-postgres.ps1`. O backup gera dump PostgreSQL em formato
     customizado; a restauração exige explicitamente `-ConfirmRestore` para
     reduzir o risco de sobrescrita acidental.
107. O backup PostgreSQL foi executado com sucesso, gerando um dump customizado
     de 80.598 bytes. O guard de restauração também foi validado: sem
     `-ConfirmRestore`, nenhuma alteração é executada.
108. Foi criado `scripts/verify-postgres-backup.ps1` para validar dumps
     customizados com `pg_restore --list` sem alterar o banco. O procedimento
     deve ser executado antes de transportar o arquivo para armazenamento
     externo ou iniciar um teste de restauração.
109. A validação final da aplicação foi executada sem restaurar backup:
     `pnpm build` passou, a suíte backend passou com 20 testes e 8 testes Redis
     reais pulados por configuração, e o load smoke com 100 requisições passou
     sem erros, p95 de 469,23 ms e p99 de 482,36 ms.
110. A stack Docker permaneceu operacional após os testes: PostgreSQL saudável,
     Redis saudável, duas APIs, worker, Redis Exporter, Prometheus, Grafana e
     Alertmanager em execução.
111. O teste Redis de Socket.IO foi executado com `REDIS_URL` real e passou com
     2 testes. O fixture BullMQ foi atualizado para usar segredos HMAC
     criptografados, conforme a regra atual da aplicação.
112. O fixture BullMQ passou a aceitar `WEBHOOK_TEST_HOST` e
     `WEBHOOK_TEST_ENDPOINT_HOST`, permitindo executar o servidor HTTP em uma
     interface de rede compartilhada quando o worker estiver em outro container.
113. Foi criado `.github/workflows/chatsalles-ci.yml` com jobs de backend
     (PostgreSQL, Redis, build, migração e testes) e Compose (configuração,
     stack, failover smoke e coleta de logs em falha). O job backend usa um
     prefixo BullMQ isolado (`ci`) para impedir concorrência com workers
     externos.
114. A conexão BullMQ deixou de aplicar `commandTimeout` aos comandos Redis
     bloqueantes. Com essa correção, a execução local com Redis real passou
     5 testes: 3 de webhooks e 2 de Socket.IO.
115. O ESLint foi instalado no workspace `backend-node`, com parser TypeScript
     e configuração própria. O lint passou sem erros, o build passou e a
     suíte completa passou com 20 testes; 8 testes Redis foram pulados quando
     executados sem `REDIS_URL`.
116. O job backend do workflow passou a executar lint entre build e migração.
117. O CI GitHub Actions run #7 foi aprovado integralmente, incluindo build,
     lint, migrações, testes padrão, testes Redis/BullMQ, Compose e failover
     smoke.
118. O rate limiter passou a usar uma conexão Redis operacional separada, com
     timeout curto, preservando a conexão BullMQ para comandos bloqueantes.
119. O smoke de failover passou a aplicar timeout explícito nas requisições
     HTTP, evitando bloqueio indefinido quando o Redis é interrompido.
120. O backend agora recusa inicialização em produção quando `JWT_SECRET`
     ainda usa o valor padrão de desenvolvimento.
121. O override de produção passou a exigir `REDIS_PASSWORD`, ativar
     autenticação no Redis e propagar a URL autenticada para APIs, worker e
     Redis Exporter.

Próxima tarefa ao retomar:

1. Configurar secrets reais fora do Git, TLS e reverse proxy no ambiente de
   produção.
2. Substituir o receiver de exemplo do Alertmanager por um endpoint autorizado
   e testar uma notificação.
3. Remover o seed de demonstração do processo de produção e trocar a senha do
   administrador após o primeiro acesso.
4. Planejar e implementar os módulos restantes necessários para paridade com
   Chatwoot, priorizando canais e integrações.

Smoke test operacional:

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles
.\scripts\failover-smoke.ps1
```

Comandos de integração Redis:

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles\backend-node
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chatsalles'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:WEBHOOK_TIMEOUT_MS='100'
$env:WEBHOOK_MAX_ATTEMPTS='2'
$env:BULLMQ_QUEUE_PREFIX='integration'
pnpm exec vitest run --config vitest.config.ts tests/webhooks.redis.integration.test.ts
pnpm exec vitest run --config vitest.config.ts tests/realtime.redis.integration.test.ts
```

Comandos Docker validados:

```powershell
cd C:\Users\SALLES\Downloads\ChatSalles
docker compose -f docker-compose.chatsalles.yml up -d --build
docker compose -f docker-compose.chatsalles.yml ps
```
```
