# ChatSalles - Checklist de deploy seguro

## Secrets e configuração

- [ ] Definir `JWT_SECRET` forte e exclusivo por ambiente.
- [ ] Definir `WEBHOOK_ENCRYPTION_KEY` com 64 caracteres hexadecimais.
- [ ] Remover senhas padrão de PostgreSQL e Redis.
- [ ] Definir `REDIS_PASSWORD` forte e confirmar que a URL Redis usa autenticação.
- [ ] Fornecer secrets por Docker Secrets, Kubernetes Secrets ou secret manager.
- [ ] Confirmar `NODE_ENV=production`.
- [ ] Confirmar `FRONTEND_URL` com origem exata, sem wildcard.
- [ ] Definir `LOG_LEVEL` conforme a política de produção.
- [ ] Copiar `.env.production.example` para `.env.production` e substituir todos os placeholders.

## Rede e infraestrutura

- [ ] Não publicar a porta do Redis na Internet.
- [ ] Não publicar Prometheus, Grafana ou Alertmanager diretamente na Internet.
- [ ] Restringir PostgreSQL à rede privada.
- [ ] Expor somente o reverse proxy/API necessários.
- [ ] Usar `docker-compose.production.yml` atrás de um reverse proxy privado.
- [ ] Configurar TLS/HTTPS para frontend, API e webhooks.
- [ ] Aplicar firewall e security groups.
- [ ] Usar volumes persistentes para PostgreSQL, logs e filas conforme a estratégia de backup.
- [ ] Configurar restart policy e health checks dos containers.

## Aplicação

- [ ] Executar migrações antes de liberar tráfego.
- [ ] Executar seed somente em ambientes de demonstração.
- [ ] Confirmar o administrador inicial `admin@chatsalles.com.br` e trocar a senha após o primeiro acesso.
- [ ] Confirmar que usuários administrativos possuem `role=admin`.
- [ ] Confirmar rate limiting distribuído com Redis.
- [ ] Confirmar proteção anti-SSRF de webhooks.
- [ ] Confirmar que segredos HMAC não aparecem em logs, listagens ou métricas.
- [ ] Confirmar backup e restauração do PostgreSQL.
- [ ] Executar `.\scripts\backup-postgres.ps1` e armazenar o dump fora do host.
- [ ] Validar o dump com `.\scripts\verify-postgres-backup.ps1 -BackupPath <arquivo>`.
- [ ] Testar `.\scripts\restore-postgres.ps1 -BackupPath <arquivo> -ConfirmRestore` em ambiente separado.
- [ ] Executar os scripts usando o mesmo projeto Compose da implantação para
      localizar o container e as credenciais corretos.

## Observabilidade

- [ ] Publicar `/metrics` somente para o sistema de monitoramento autorizado.
- [ ] Configurar o Prometheus para coletar as duas APIs.
- [ ] Configurar o Grafana com datasource Prometheus e credenciais fortes.
- [ ] Carregar as regras de alerta de `monitoring/alerts.yml`.
- [ ] Configurar um canal de notificação para os alertas.
- [ ] Coletar logs JSONL de API e worker.
- [ ] Criar alertas para HTTP 5xx, 429, falha do worker, dead-letter e Redis indisponível.
- [ ] Substituir o receiver de exemplo do Alertmanager pelo endpoint real e testar uma notificação.
- [ ] Confirmar Redis Exporter e alerta de Redis indisponível.
- [ ] Monitorar p95/p99 de latência.
- [ ] Monitorar tamanho das filas e idade do job mais antigo.
- [ ] Definir retenção e rotação de logs.

## Operação e recuperação

- [ ] Testar reinício do worker sem perda de jobs.
- [ ] Testar falha de uma API com a outra disponível.
- [ ] Testar reinício do Redis e comportamento do fallback.
- [ ] Executar `.\scripts\failover-smoke.ps1` em homologação.
- [ ] Testar dead-letter e reprocessamento por conta.
- [ ] Documentar rollback da versão.
- [ ] Documentar contatos e procedimento de incidente.

## Validação final

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] Testes Redis/BullMQ com `REDIS_URL`.
- [ ] `docker compose config`
- [ ] `pnpm load:smoke`
- [ ] Teste manual de login, conversas, mensagens, automações e webhooks.
