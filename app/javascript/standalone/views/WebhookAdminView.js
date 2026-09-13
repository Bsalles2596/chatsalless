export const WebhookAdminView = {
  props: {
    webhooks: { type: Array, required: true },
    deliveries: { type: Array, required: true },
    form: { type: Object, required: true },
    page: { type: Number, required: true },
    totalPages: { type: Number, required: true },
    statusFilter: { type: String, required: true },
    eventFilter: { type: String, required: true },
    queueMetrics: { type: Object, default: null },
    deadLetters: { type: Array, default: () => [] },
    loading: Boolean,
  },
  emits: ['refresh', 'submit', 'toggle', 'delete', 'rotate', 'retry', 'reprocess-dead-letter', 'page', 'update:form', 'update:event-filter', 'update:status-filter'],
  template: `
    <section class="admin-panel">
      <div class="admin-heading"><div><h2>Webhooks</h2><p>Endpoints, assinatura e entregas.</p></div><button @click="$emit('refresh')">Atualizar</button></div>
      <form class="admin-form" @submit.prevent="$emit('submit')">
        <input :value="form.name" placeholder="Nome" required @input="$emit('update:form', { ...form, name: $event.target.value })" />
        <input :value="form.url" type="url" placeholder="https://..." required @input="$emit('update:form', { ...form, url: $event.target.value })" />
        <input :value="form.events" placeholder="Eventos separados por vírgula" @input="$emit('update:form', { ...form, events: $event.target.value })" />
        <button :disabled="loading">Adicionar webhook</button>
      </form>
      <ul class="admin-list"><li v-for="webhook in webhooks" :key="webhook.id"><strong>{{ webhook.name }}</strong><span>{{ webhook.url }} · {{ webhook.active ? 'ativo' : 'inativo' }}</span><button class="secondary" @click="$emit('toggle', webhook)">Alternar</button><button class="secondary" @click="$emit('rotate', webhook)">Rotacionar</button><button class="secondary" @click="$emit('delete', webhook)">Excluir</button></li></ul>
      <div class="admin-filters"><input :value="eventFilter" placeholder="Filtrar evento" @input="$emit('update:event-filter', $event.target.value)" /><select :value="statusFilter" @change="$emit('update:status-filter', $event.target.value)"><option value="">Todos os status</option><option value="succeeded">Sucesso</option><option value="pending">Pendente</option><option value="failed">Falha</option></select></div>
      <h3>Entregas recentes</h3>
      <ul class="admin-list"><li v-for="delivery in deliveries" :key="delivery.id"><span>{{ delivery.event_name }} · {{ delivery.status }} · tentativa {{ delivery.attempts }}</span><button v-if="delivery.status === 'failed'" class="secondary" @click="$emit('retry', delivery)">Reprocessar</button></li></ul>
      <div class="admin-operations">
        <h3>Operação da fila</h3>
        <p v-if="!queueMetrics">Métricas indisponíveis.</p>
        <p v-else>Worker: {{ queueMetrics.worker?.processed || 0 }} processados · {{ queueMetrics.worker?.succeeded || 0 }} sucessos · {{ queueMetrics.worker?.failed || 0 }} falhas · {{ queueMetrics.worker?.retried || 0 }} retries</p>
        <p v-if="queueMetrics">Fila: {{ queueMetrics.waiting || 0 }} pendentes · {{ queueMetrics.active || 0 }} ativos · {{ queueMetrics.delayed || 0 }} atrasados · Dead-letter: {{ queueMetrics.deadLetter?.waiting || 0 }}</p>
        <h4>Dead-letter</h4>
        <p v-if="!deadLetters.length" class="empty">Nenhum job aguardando reprocessamento.</p>
        <ul class="admin-list"><li v-for="job in deadLetters" :key="job.id"><span>{{ job.eventName }} · {{ job.error }} · tentativa {{ job.attempts }}</span><button class="secondary" @click="$emit('reprocess-dead-letter', job)">Reprocessar</button></li></ul>
      </div>
      <nav class="pagination"><button class="secondary" :disabled="page === 1" @click="$emit('page', page - 1)">Anterior</button><span>Página {{ page }} de {{ totalPages }}</span><button class="secondary" :disabled="page === totalPages" @click="$emit('page', page + 1)">Próxima</button></nav>
    </section>
  `,
};
