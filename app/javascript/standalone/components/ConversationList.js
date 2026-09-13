export const ConversationList = {
  props: {
    conversations: { type: Array, required: true },
    selectedConversation: { type: Object, default: null },
  },
  emits: ['select'],
  template: `
    <div class="conversation-list">
      <article v-for="conversation in conversations" :key="conversation.id"
        class="conversation" :class="{ selected: selectedConversation?.id === conversation.id }"
        @click="$emit('select', conversation)">
        <div class="avatar">{{ (conversation.contact_name || conversation.contact_id || 'C').slice(0, 1).toUpperCase() }}</div>
        <div class="conversation-body">
          <strong>{{ conversation.contact_name || 'Contato ' + conversation.contact_id.slice(0, 8) }}</strong>
          <p>{{ conversation.last_message || 'Sem mensagens' }}</p>
          <div class="conversation-meta">
            <small>{{ conversation.status }} · prioridade {{ conversation.priority || 0 }}</small>
            <span v-if="conversation.unread_count" class="unread-badge">{{ conversation.unread_count }} não lida(s)</span>
          </div>
          <div class="label-list">
            <span v-for="label in (conversation.labels || [])" :key="label" class="label">{{ label }}</span>
          </div>
        </div>
      </article>
    </div>
  `,
};
