import { ContactForm } from '../components/ContactForm';

export const ContactsView = {
  components: { ContactForm },
  props: {
    contacts: { type: Array, required: true },
    search: { type: String, required: true },
    loading: Boolean,
    error: { type: String, default: '' },
    creatingConversation: Boolean,
    modal: Boolean,
    editingId: { type: String, default: null },
    form: { type: Object, required: true },
    formLoading: Boolean,
    formError: { type: String, default: '' },
  },
  emits: ['search', 'new', 'create-conversation', 'edit', 'delete', 'submit', 'cancel', 'update:form'],
  template: `
    <section class="contacts-view">
      <div class="contacts-toolbar">
        <input :value="search" placeholder="Buscar contato..." @input="$emit('update:search', $event.target.value)" @keyup.enter="$emit('search')" />
        <button class="secondary" @click="$emit('search')">Buscar</button>
        <button @click="$emit('new')">Novo contato</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="loading" class="empty">Carregando contatos...</div>
      <div v-else-if="!contacts.length" class="empty">Nenhum contato encontrado.</div>
      <div v-else class="contact-list">
        <article v-for="contact in contacts" :key="contact.id" class="contact-card">
          <div class="avatar">{{ contact.name.slice(0, 1).toUpperCase() }}</div>
          <div class="contact-info"><strong>{{ contact.name }}</strong><small>{{ contact.email || contact.phone_number || 'Sem dados adicionais' }}</small></div>
          <button :disabled="creatingConversation" @click="$emit('create-conversation', contact)">Nova conversa</button>
          <button class="secondary" @click="$emit('edit', contact)">Editar</button>
          <button class="danger" @click="$emit('delete', contact)">Excluir</button>
        </article>
      </div>
      <ContactForm :open="modal" :editing-id="editingId" :form="form" :loading="formLoading" :error="formError"
        @submit="$emit('submit')" @cancel="$emit('cancel')" @update:form="$emit('update:form', $event)" />
    </section>
  `,
};
