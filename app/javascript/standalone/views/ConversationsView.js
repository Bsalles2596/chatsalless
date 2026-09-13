import { ConversationList } from '../components/ConversationList';
import { MessagePanel } from '../components/MessagePanel';

export const ConversationsView = {
  components: { ConversationList, MessagePanel },
  props: {
    conversations: { type: Array, required: true },
    selectedConversation: { type: Object, default: null },
    messages: { type: Array, required: true },
    inboxes: { type: Array, required: true },
    agents: { type: Array, required: true },
    teams: { type: Array, required: true },
    labelDraft: { type: String, required: true },
    draft: { type: String, required: true },
    privateDraft: Boolean,
    attachmentFile: { type: Object, default: null },
    sending: Boolean,
    loading: Boolean,
    total: Number,
    page: Number,
    totalPages: Number,
  },
  emits: ['select', 'read', 'unread', 'delete-conversation', 'inbox', 'status', 'priority', 'labels', 'load-assignment-options', 'assign', 'retry', 'delete-message', 'send', 'attachment', 'update:label-draft', 'update:draft', 'update:private-draft', 'page'],
  template: `
    <template>
      <div class="summary">{{ total }} conversa(s) encontrada(s)</div>
      <div v-if="loading" class="empty">Carregando...</div>
      <div v-else-if="!conversations.length" class="empty">Nenhuma conversa encontrada.</div>
      <div v-else class="conversation-layout">
        <ConversationList :conversations="conversations" :selected-conversation="selectedConversation" @select="$emit('select', $event)" />
        <MessagePanel
          :conversation="selectedConversation" :messages="messages" :inboxes="inboxes" :agents="agents" :teams="teams"
          :label-draft="labelDraft" :draft="draft" :private-draft="privateDraft" :attachment-file="attachmentFile" :sending="sending"
          @read="$emit('read')" @unread="$emit('unread')" @delete-conversation="$emit('delete-conversation')"
          @inbox="$emit('inbox', $event)" @status="$emit('status', $event)" @priority="$emit('priority', $event)"
          @labels="$emit('labels')" @load-assignment-options="$emit('load-assignment-options')"
          @assign="$emit('assign', $event)" @retry="$emit('retry', $event)" @delete-message="$emit('delete-message', $event)"
          @send="$emit('send')" @attachment="$emit('attachment', $event)"
          @update:label-draft="$emit('update:label-draft', $event)" @update:draft="$emit('update:draft', $event)"
          @update:private-draft="$emit('update:private-draft', $event)"
        />
      </div>
      <nav class="pagination">
        <button class="secondary" :disabled="page === 1" @click="$emit('page', page - 1)">Anterior</button>
        <span>Página {{ page }} de {{ totalPages }}</span>
        <button class="secondary" :disabled="page === totalPages" @click="$emit('page', page + 1)">Próxima</button>
      </nav>
    </template>
  `,
};
