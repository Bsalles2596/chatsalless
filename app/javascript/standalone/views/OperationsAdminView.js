export const OperationsAdminView = {
  props: {
    inboxes: { type: Array, required: true },
    teams: { type: Array, required: true },
    inboxForm: { type: Object, required: true },
    teamForm: { type: Object, required: true },
    providerConfig: { type: Object, default: null },
    providerForm: { type: Object, required: true },
    loading: Boolean,
  },
  emits: ['refresh', 'create-inbox', 'update-inbox', 'delete-inbox', 'create-team', 'update-team', 'delete-team', 'configure-provider', 'rotate-provider', 'select-inbox', 'update:inbox-form', 'update:team-form', 'update:provider-form'],
  template: `
    <section class="admin-panel">
      <div class="admin-heading"><div><h2>Operações</h2><p>Inboxes, canais e equipes.</p></div><button @click="$emit('refresh')">Atualizar</button></div>
      <div class="admin-columns">
        <form class="admin-form" @submit.prevent="$emit('create-inbox')">
          <h3>Nova inbox</h3>
          <input :value="inboxForm.name" placeholder="Nome da inbox" required @input="$emit('update:inbox-form', { ...inboxForm, name: $event.target.value })" />
          <select :value="inboxForm.channelType" @change="$emit('update:inbox-form', { ...inboxForm, channelType: $event.target.value })">
            <option value="api">API</option><option value="web_widget">Web Widget</option><option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="sms">SMS</option>
          </select>
          <button :disabled="loading">Adicionar inbox</button>
        </form>
        <form class="admin-form" @submit.prevent="$emit('create-team')">
          <h3>Nova equipe</h3>
          <input :value="teamForm.name" placeholder="Nome da equipe" required @input="$emit('update:team-form', { ...teamForm, name: $event.target.value })" />
          <input :value="teamForm.description" placeholder="Descrição" @input="$emit('update:team-form', { ...teamForm, description: $event.target.value })" />
          <button :disabled="loading">Adicionar equipe</button>
        </form>
      </div>
      <h3>Inboxes</h3>
      <ul class="admin-list">
        <li v-for="inbox in inboxes" :key="inbox.id">
          <span><strong>{{ inbox.name }}</strong> · {{ inbox.channelType }}</span>
          <button class="secondary" @click="$emit('select-inbox', inbox.id)">Provedor</button>
          <button class="secondary" @click="$emit('update-inbox', inbox)">Editar</button>
          <button class="danger" @click="$emit('delete-inbox', inbox)">Excluir</button>
        </li>
      </ul>
      <h3>Equipes</h3>
      <ul class="admin-list">
        <li v-for="team in teams" :key="team.id">
          <span><strong>{{ team.name }}</strong><small v-if="team.description"> · {{ team.description }}</small></span>
          <button class="secondary" @click="$emit('update-team', team)">Editar</button>
          <button class="danger" @click="$emit('delete-team', team)">Excluir</button>
        </li>
      </ul>
      <form v-if="providerForm.inboxId" class="admin-form" @submit.prevent="$emit('configure-provider')">
        <h3>Configuração do provedor</h3>
        <p v-if="providerConfig">Inbox selecionada: {{ providerConfig.provider }} · {{ providerConfig.enabled ? 'ativa' : 'inativa' }} · credenciais configuradas</p>
        <label>Credenciais (JSON)<textarea :value="providerForm.credentials" placeholder='{"token":"..."}' @input="$emit('update:provider-form', { ...providerForm, credentials: $event.target.value })"></textarea></label>
        <label><input type="checkbox" :checked="providerForm.enabled" @change="$emit('update:provider-form', { ...providerForm, enabled: $event.target.checked })" /> Ativa</label>
        <button :disabled="loading">Salvar configuração</button>
        <button v-if="providerConfig" type="button" class="secondary" @click="$emit('rotate-provider')">Rotacionar credenciais</button>
      </form>
      <p v-else class="empty">Selecione uma inbox para configurar o provedor.</p>
    </section>
  `,
};
