export const MessagePanel = {
  props: {
    conversation: { type: Object, default: null },
    messages: { type: Array, required: true },
    inboxes: { type: Array, required: true },
    agents: { type: Array, required: true },
    teams: { type: Array, required: true },
    labelDraft: { type: String, required: true },
    draft: { type: String, required: true },
    privateDraft: { type: Boolean, required: true },
    attachmentFile: { type: Object, default: null },
    sending: { type: Boolean, default: false },
  },
  emits: [
    'read', 'unread', 'delete-conversation', 'inbox', 'status', 'priority',
    'labels', 'load-assignment-options', 'assign', 'retry', 'delete-message',
    'send', 'attachment', 'update:label-draft', 'update:draft', 'update:private-draft',
  ],
  template: `
    <section v-if="conversation" class="message-panel">
      <div class="message-header">
        <div>
          <strong>{{ conversation.contact_name || 'Conversa ' + conversation.id.slice(0, 8) }}</strong>
          <small class="message-subtitle">{{ conversation.contact_email || conversation.contact_phone || '' }}</small>
        </div>
        <small>{{ conversation.status }}</small>
      </div>
      <div class="conversation-context">
        <span v-if="conversation.inbox_name">Inbox: {{ conversation.inbox_name }}</span>
        <span v-if="conversation.assignee_email">Agente: {{ conversation.assignee_email }}</span>
        <span v-if="conversation.team_name">Equipe: {{ conversation.team_name }}</span>
        <span>Não lidas: {{ conversation.unread_count || 0 }}</span>
        <button class="secondary compact" @click="$emit('read')">Marcar lida</button>
        <button class="secondary compact" @click="$emit('unread')">Marcar não lida</button>
        <button class="danger compact" @click="$emit('delete-conversation')">Excluir conversa</button>
      </div>
      <div class="conversation-actions">
        <select :value="conversation.inbox_id || ''" @change="$emit('inbox', $event.target.value)">
          <option value="">Sem inbox</option>
          <option v-for="inbox in inboxes" :key="inbox.id" :value="inbox.id">{{ inbox.name }}</option>
        </select>
        <select :value="conversation.status" @change="$emit('status', $event.target.value)">
          <option value="open">Aberta</option><option value="pending">Pendente</option><option value="resolved">Resolvida</option>
        </select>
        <select :value="conversation.priority || 0" @change="$emit('priority', Number($event.target.value))">
          <option value="0">Sem prioridade</option><option value="1">Alta</option><option value="2">Urgente</option><option value="3">Crítica</option>
        </select>
        <input :value="labelDraft" placeholder="labels: sales, vip" @input="$emit('update:label-draft', $event.target.value)" @keyup.enter="$emit('labels')" />
        <button class="secondary" @click="$emit('labels')">Salvar labels</button>
      </div>
      <div class="conversation-actions">
        <select @focus="$emit('load-assignment-options')" @change="$emit('assign', { type: 'user', id: $event.target.value })">
          <option value="">Atribuir agente...</option>
          <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.email }}</option>
        </select>
        <select @focus="$emit('load-assignment-options')" @change="$emit('assign', { type: 'team', id: $event.target.value })">
          <option value="">Atribuir equipe...</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
        </select>
        <button class="secondary compact" @click="$emit('assign', { type: 'unassigned', id: null })">Remover atribuição</button>
      </div>
      <div class="messages">
        <div v-for="message in messages" :key="message.id" class="message">
          <p>{{ message.content }}</p>
          <small>{{ message.private ? 'Nota privada' : 'Mensagem' }} · {{ message.status }}</small>
          <div class="message-actions">
            <button v-if="message.status !== 'sent'" class="secondary compact" @click="$emit('retry', message)">Tentar novamente</button>
            <button class="danger compact" @click="$emit('delete-message', message)">Excluir</button>
          </div>
        </div>
        <p v-if="!messages.length" class="empty">Nenhuma mensagem ainda.</p>
      </div>
      <form class="composer" @submit.prevent="$emit('send')">
        <input :value="draft" placeholder="Escreva uma mensagem..." :disabled="sending" @input="$emit('update:draft', $event.target.value)" />
        <label class="file-button">Anexar<input ref="attachmentInput" type="file" @change="$emit('attachment', $event)" /></label>
        <label class="private-toggle"><input :checked="privateDraft" type="checkbox" @change="$emit('update:private-draft', $event.target.checked)" /> Nota privada</label>
        <button :disabled="sending || (!draft.trim() && !attachmentFile)">{{ sending ? 'Enviando...' : 'Enviar' }}</button>
      </form>
      <small v-if="attachmentFile" class="attachment-name">Arquivo: {{ attachmentFile.name }}</small>
    </section>
  `,
};
