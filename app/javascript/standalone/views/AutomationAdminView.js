export const AutomationAdminView = {
  props: {
    rules: { type: Array, required: true },
    executions: { type: Array, required: true },
    form: { type: Object, required: true },
    page: { type: Number, required: true },
    totalPages: { type: Number, required: true },
    eventFilter: { type: String, required: true },
    statusFilter: { type: String, required: true },
    loading: Boolean,
  },
  emits: ['refresh', 'submit', 'toggle', 'delete', 'page', 'update:form', 'update:event-filter', 'update:status-filter'],
  template: `
    <section class="admin-panel">
      <div class="admin-heading"><div><h2>Automações</h2><p>Regras e histórico de execução.</p></div><button @click="$emit('refresh')">Atualizar</button></div>
      <form class="admin-form" @submit.prevent="$emit('submit')">
        <input :value="form.name" placeholder="Nome da regra" required @input="$emit('update:form', { ...form, name: $event.target.value })" />
        <input :value="form.eventName" placeholder="Evento (ex.: message.created)" required @input="$emit('update:form', { ...form, eventName: $event.target.value })" />
        <select :value="form.actionStatus" @change="$emit('update:form', { ...form, actionStatus: $event.target.value })"><option value="">Sem ação de status</option><option value="open">Aberta</option><option value="pending">Pendente</option><option value="resolved">Resolvida</option></select>
        <textarea :value="form.conditions" placeholder='Condições JSON (opcional)' @input="$emit('update:form', { ...form, conditions: $event.target.value })"></textarea>
        <textarea :value="form.actions" placeholder='Ações JSON (opcional)' @input="$emit('update:form', { ...form, actions: $event.target.value })"></textarea>
        <button :disabled="loading">Criar regra</button>
      </form>
      <div class="admin-filters"><input :value="eventFilter" placeholder="Filtrar evento" @input="$emit('update:event-filter', $event.target.value)" /><select :value="statusFilter" @change="$emit('update:status-filter', $event.target.value)"><option value="">Todos</option><option value="succeeded">Sucesso</option><option value="failed">Falha</option></select></div>
      <div v-if="!rules.length" class="empty">Nenhuma automação cadastrada.</div>
      <ul class="admin-list"><li v-for="rule in rules" :key="rule.id"><strong>{{ rule.name }}</strong><span>{{ rule.eventName }} · {{ rule.active ? 'ativa' : 'inativa' }}</span><button class="secondary" @click="$emit('toggle', rule)">Alternar</button><button class="secondary" @click="$emit('delete', rule)">Excluir</button></li></ul>
      <h3>Execuções recentes</h3>
      <ul class="admin-list"><li v-for="execution in executions" :key="execution.id"><span>{{ execution.event_name }} · {{ execution.status }}</span><small>{{ execution.started_at }}</small></li></ul>
      <nav class="pagination"><button class="secondary" :disabled="page === 1" @click="$emit('page', page - 1)">Anterior</button><span>Página {{ page }} de {{ totalPages }}</span><button class="secondary" :disabled="page === totalPages" @click="$emit('page', page + 1)">Próxima</button></nav>
    </section>
  `,
};
