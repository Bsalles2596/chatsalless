import { createApp } from 'vue';
import './style.css';
import { request } from './api';
import { LoginView } from './views/LoginView';
import { ContactsView } from './views/ContactsView';
import { ConversationsView } from './views/ConversationsView';
import { ContactForm } from './components/ContactForm';
import { ConversationList } from './components/ConversationList';
import { MessagePanel } from './components/MessagePanel';
import { connectRealtime } from './realtime';
import { AutomationAdminView } from './views/AutomationAdminView';
import { WebhookAdminView } from './views/WebhookAdminView';
import { OperationsAdminView } from './views/OperationsAdminView';

const appTemplate = `
    <main class="shell">
      <LoginView v-if="!loggedIn" :logged-in="loggedIn" :email="email" :password="password" :loading="loading" :error="error" :notice="notice"
        @login="login" @update:email="email = $event" @update:password="password = $event" />
      <section v-else class="workspace">
        <header>
          <div><div class="brand">Chat<span>Salles</span></div><small>{{ view === 'contacts' ? 'Contatos' : 'Conversas' }}</small></div>
          <div class="header-actions">
            <button class="secondary" :class="{ active: view === 'conversations' }" @click="view = 'conversations'">Conversas</button>
            <button class="secondary" :class="{ active: view === 'contacts' }" @click="view = 'contacts'">Contatos</button>
            <button class="secondary" :class="{ active: view === 'automations' }" @click="openAdmin('automations')">Automações</button>
            <button class="secondary" :class="{ active: view === 'webhooks' }" @click="openAdmin('webhooks')">Webhooks</button>
            <button class="secondary" :class="{ active: view === 'operations' }" @click="openAdmin('operations')">Operações</button>
            <button class="secondary" @click="logout">Sair</button>
          </div>
        </header>
        <div v-if="view === 'conversations'" class="toolbar">
          <select v-model="status" @change="applyFilters">
            <option value="">Todos os status</option><option value="open">Abertas</option>
            <option value="pending">Pendentes</option><option value="resolved">Resolvidas</option>
          </select>
          <select v-model="priority" @change="applyFilters">
            <option value="">Todas as prioridades</option><option value="1">Alta</option>
            <option value="2">Urgente</option>
          </select>
          <input v-model="labels" placeholder="Labels (ex.: sales, vip)" @keyup.enter="applyFilters" />
          <select v-model="sort" @change="applyFilters">
            <option value="updated_at">Mais recentes</option><option value="created_at">Mais antigas</option>
            <option value="priority">Prioridade</option><option value="alphabetical">Alfabética</option>
          </select>
          <button @click="applyFilters">Filtrar</button>
        </div>
        <ContactsView v-if="view === 'contacts'" :contacts="contacts" :search="contactSearch" :loading="contactLoading"
          :error="contactError" :creating-conversation="creatingConversation" :modal="contactModal"
          :editing-id="editingContactId" :form="contactForm" :form-loading="contactLoading" :form-error="contactError"
          @search="loadContacts" @new="openContactModal" @create-conversation="createConversation"
          @edit="editContact" @delete="deleteContact" @submit="createContact" @cancel="contactModal = false"
          @update:form="contactForm = $event" @update:search="contactSearch = $event" />
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <ConversationsView v-if="view === 'conversations'" :conversations="conversations"
          :selected-conversation="selectedConversation" :messages="messages" :inboxes="inboxes" :agents="agents" :teams="teams"
          :label-draft="labelDraft" :draft="draft" :private-draft="privateDraft" :attachment-file="attachmentFile"
          :sending="sending" :loading="loading" :total="total" :page="page" :total-pages="totalPages"
          @select="selectConversation" @read="markConversationRead" @unread="markConversationUnread"
          @delete-conversation="deleteConversation" @inbox="updateConversationInbox"
          @status="updateConversation('toggle_status', { status: $event })"
          @priority="updateConversation('toggle_priority', { priority: $event })"
          @labels="saveConversationLabels" @load-assignment-options="loadAssignmentOptions"
          @assign="assignConversationEvent" @retry="retryMessage" @delete-message="deleteMessage"
          @send="sendMessage" @attachment="onAttachmentSelected"
          @update:label-draft="labelDraft = $event" @update:draft="draft = $event"
          @update:private-draft="privateDraft = $event" @page="changePage" />
        <AutomationAdminView v-if="view === 'automations'" :rules="automationRules" :executions="adminExecutionsPage" :form="automationForm" :loading="adminLoading"
          :page="automationPage" :total-pages="automationTotalPages" :event-filter="automationEventFilter" :status-filter="automationStatusFilter"
          @refresh="loadAdminData" @submit="createAutomation" @toggle="toggleAutomation" @delete="deleteAutomation"
          @page="automationPage = $event" @update:event-filter="automationEventFilter = $event"
          @update:status-filter="automationStatusFilter = $event" @update:form="automationForm = $event" />
        <WebhookAdminView v-if="view === 'webhooks'" :webhooks="webhooks" :deliveries="adminDeliveriesPage" :form="webhookForm" :loading="adminLoading"
          :queue-metrics="webhookQueueMetrics" :dead-letters="deadLetterJobs"
          :page="webhookPage" :total-pages="webhookTotalPages" :event-filter="webhookEventFilter" :status-filter="webhookStatusFilter"
          @refresh="loadAdminData" @submit="createWebhook" @toggle="toggleWebhook" @rotate="rotateWebhook" @delete="deleteWebhook" @retry="retryWebhook"
          @reprocess-dead-letter="reprocessDeadLetter"
          @page="webhookPage = $event" @update:event-filter="webhookEventFilter = $event"
          @update:status-filter="webhookStatusFilter = $event" @update:form="webhookForm = $event" />
        <OperationsAdminView v-if="view === 'operations'" :inboxes="inboxes" :teams="teams" :inbox-form="inboxForm" :team-form="teamForm" :loading="adminLoading"
          @refresh="loadOperations" @create-inbox="createInbox" @update-inbox="editInbox" @delete-inbox="deleteInbox"
          @create-team="createTeam" @update-team="editTeam" @delete-team="deleteTeam"
          @update:inbox-form="inboxForm = $event" @update:team-form="teamForm = $event" />
      </section>
    </main>
`;

export const App = {
  components: { LoginView, ContactsView, ConversationsView, AutomationAdminView, WebhookAdminView, OperationsAdminView, ContactForm, ConversationList, MessagePanel },
  data() {
    return {
      email: 'admin@chatsalles.com.br',
      password: '',
      accountId: '',
      loggedIn: Boolean(localStorage.getItem('chatsalles_jwt')),
      loading: false,
      error: '',
      notice: '',
      conversations: [],
      total: 0,
      page: 1,
      perPage: 20,
      status: '',
      priority: '',
      labels: '',
      sort: 'updated_at',
      selectedConversation: null,
      messages: [],
      draft: '',
      privateDraft: false,
      attachmentFile: null,
      sending: false,
      view: 'conversations',
      contacts: [],
      contactSearch: '',
      contactForm: { name: '', email: '', phoneNumber: '' },
      contactModal: false,
      editingContactId: null,
      contactLoading: false,
      contactError: '',
      creatingConversation: false,
      conversationLabels: [],
      labelDraft: '',
      agents: [],
      teams: [],
      inboxes: [],
      inboxForm: { name: '', channelType: 'api' },
      teamForm: { name: '', description: '' },
      realtimeSocket: null,
      automationRules: [],
      automationExecutions: [],
      webhooks: [],
      webhookDeliveries: [],
      webhookQueueMetrics: null,
      deadLetterJobs: [],
      adminRefreshTimer: null,
      automationForm: { name: '', eventName: 'message.created', actionStatus: '', conditions: '', actions: '' },
      webhookForm: { name: '', url: '', events: '' },
      adminLoading: false,
      automationPage: 1,
      webhookPage: 1,
      adminPageSize: 10,
      automationEventFilter: '',
      automationStatusFilter: '',
      webhookEventFilter: '',
      webhookStatusFilter: '',
    };
  },
  computed: {
    totalPages() {
      return Math.max(1, Math.ceil(this.total / this.perPage));
    },
    filteredAutomationExecutions() {
      return this.automationExecutions.filter((item) =>
        (!this.automationEventFilter || item.event_name.includes(this.automationEventFilter))
        && (!this.automationStatusFilter || item.status === this.automationStatusFilter));
    },
    adminExecutionsPage() {
      const start = (this.automationPage - 1) * this.adminPageSize;
      return this.filteredAutomationExecutions.slice(start, start + this.adminPageSize);
    },
    automationTotalPages() {
      return Math.max(1, Math.ceil(this.filteredAutomationExecutions.length / this.adminPageSize));
    },
    webhookTotalPages() {
      return Math.max(1, Math.ceil(this.filteredWebhookDeliveries.length / this.adminPageSize));
    },
    filteredWebhookDeliveries() {
      return this.webhookDeliveries.filter((item) =>
        (!this.webhookEventFilter || item.event_name.includes(this.webhookEventFilter))
        && (!this.webhookStatusFilter || item.status === this.webhookStatusFilter));
    },
    adminDeliveriesPage() {
      const start = (this.webhookPage - 1) * this.adminPageSize;
      return this.filteredWebhookDeliveries.slice(start, start + this.adminPageSize);
    },
  },
  mounted() {
    if (this.loggedIn) this.loadUserAndConversations();
  },
  methods: {
    async login() {
      this.loading = true;
      this.error = '';
      try {
        const result = await request('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: this.email, password: this.password }),
        });
        localStorage.setItem('chatsalles_jwt', result.token);
        this.loggedIn = true;
        await this.loadUserAndConversations();
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async loadUserAndConversations() {
      this.loading = true;
      this.error = '';
      try {
        const user = await request('/api/v1/auth/me');
        this.accountId = user.payload.data.account_id;
        this.connectRealtime();
        await Promise.all([this.loadConversations(), this.loadContacts(), this.loadInboxes()]);
      } catch (error) {
        this.error = error.message;
        this.logout();
      } finally {
        this.loading = false;
      }
    },
    async openAdmin(view) {
      this.view = view;
      if (this.adminRefreshTimer) window.clearInterval(this.adminRefreshTimer);
      this.adminRefreshTimer = window.setInterval(() => {
        if (this.view === 'webhooks') void this.loadAdminData();
        if (this.view === 'operations') void this.loadOperations();
      }, 10000);
      if (view === 'operations') await this.loadOperations();
      else await this.loadAdminData();
    },
    async loadOperations() {
      if (!this.accountId) return;
      this.adminLoading = true;
      try {
        const [inboxes, teams] = await Promise.all([
          request(`/api/v1/accounts/${this.accountId}/inboxes`),
          request(`/api/v1/accounts/${this.accountId}/teams`),
        ]);
        this.inboxes = inboxes.data || inboxes.payload || inboxes;
        this.teams = teams.data || teams.payload || teams;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.adminLoading = false;
      }
    },
    async createInbox() {
      await request(`/api/v1/accounts/${this.accountId}/inboxes`, { method: 'POST', body: JSON.stringify(this.inboxForm) });
      this.inboxForm = { name: '', channelType: 'api' };
      this.notice = 'Inbox criada.';
      await this.loadOperations();
    },
    async editInbox(inbox) {
      const name = window.prompt('Nome da inbox:', inbox.name);
      if (!name?.trim()) return;
      const channelType = window.prompt('Tipo do canal:', inbox.channelType || 'api');
      if (!channelType?.trim()) return;
      await request(`/api/v1/accounts/${this.accountId}/inboxes/${inbox.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: name.trim(), channelType: channelType.trim() }),
      });
      this.notice = 'Inbox atualizada.';
      await this.loadOperations();
    },
    async deleteInbox(inbox) {
      if (!window.confirm(`Excluir a inbox ${inbox.name}?`)) return;
      await request(`/api/v1/accounts/${this.accountId}/inboxes/${inbox.id}`, { method: 'DELETE' });
      this.notice = 'Inbox excluída.';
      await this.loadOperations();
    },
    async createTeam() {
      await request(`/api/v1/accounts/${this.accountId}/teams`, { method: 'POST', body: JSON.stringify(this.teamForm) });
      this.teamForm = { name: '', description: '' };
      this.notice = 'Equipe criada.';
      await this.loadOperations();
    },
    async editTeam(team) {
      const name = window.prompt('Nome da equipe:', team.name);
      if (!name?.trim()) return;
      const description = window.prompt('Descrição da equipe:', team.description || '');
      await request(`/api/v1/accounts/${this.accountId}/teams/${team.id}`, {
        method: 'PATCH', body: JSON.stringify({ name: name.trim(), description }),
      });
      this.notice = 'Equipe atualizada.';
      await this.loadOperations();
    },
    async deleteTeam(team) {
      if (!window.confirm(`Excluir a equipe ${team.name}?`)) return;
      await request(`/api/v1/accounts/${this.accountId}/teams/${team.id}`, { method: 'DELETE' });
      this.notice = 'Equipe excluída.';
      await this.loadOperations();
    },
    async loadAdminData() {
      if (!this.accountId) return;
      this.adminLoading = true;
      try {
        const [rules, executions, webhooks, deliveries, queueMetrics, deadLetters] = await Promise.all([
          request(`/api/v1/accounts/${this.accountId}/automation_rules`),
          request(`/api/v1/accounts/${this.accountId}/automation_executions`),
          request(`/api/v1/accounts/${this.accountId}/webhooks`),
          request(`/api/v1/accounts/${this.accountId}/webhooks/deliveries`),
          request(`/api/v1/accounts/${this.accountId}/webhooks/queue-metrics`),
          request(`/api/v1/accounts/${this.accountId}/webhooks/dead-letter`),
        ]);
        this.automationRules = rules;
        this.automationExecutions = executions;
        this.webhooks = webhooks;
        this.webhookDeliveries = deliveries;
        this.webhookQueueMetrics = queueMetrics;
        this.deadLetterJobs = deadLetters;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.adminLoading = false;
      }
    },
    async createAutomation() {
      let conditions = [];
      let actions = [];
      try {
        conditions = this.automationForm.conditions ? JSON.parse(this.automationForm.conditions) : [];
        actions = this.automationForm.actions
          ? JSON.parse(this.automationForm.actions)
          : (this.automationForm.actionStatus
            ? [{ type: 'set_status', status: this.automationForm.actionStatus }]
            : []);
      } catch (error) {
        this.error = `JSON inválido na automação: ${error.message}`;
        return;
      }
      await request(`/api/v1/accounts/${this.accountId}/automation_rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: this.automationForm.name,
          eventName: this.automationForm.eventName,
          conditions,
          actions,
        }),
      });
      this.notice = 'Automação criada.';
      this.automationForm = { name: '', eventName: 'message.created', actionStatus: '', conditions: '', actions: '' };
      await this.loadAdminData();
    },
    async toggleAutomation(rule) {
      await request(`/api/v1/accounts/${this.accountId}/automation_rules/${rule.id}/toggle`, { method: 'POST' });
      await this.loadAdminData();
    },
    async deleteAutomation(rule) {
      if (!window.confirm('Excluir esta automação?')) return;
      await request(`/api/v1/accounts/${this.accountId}/automation_rules/${rule.id}`, { method: 'DELETE' });
      await this.loadAdminData();
    },
    async createWebhook() {
      const result = await request(`/api/v1/accounts/${this.accountId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({
          name: this.webhookForm.name,
          url: this.webhookForm.url,
          events: this.webhookForm.events.split(',').map(item => item.trim()).filter(Boolean),
        }),
      });
      this.notice = `Webhook criado. Guarde o segredo: ${result.secret}`;
      this.webhookForm = { name: '', url: '', events: '' };
      await this.loadAdminData();
    },
    async toggleWebhook(webhook) {
      await request(`/api/v1/accounts/${this.accountId}/webhooks/${webhook.id}`, { method: 'PATCH', body: JSON.stringify({ active: !webhook.active }) });
      await this.loadAdminData();
    },
    async rotateWebhook(webhook) {
      const result = await request(`/api/v1/accounts/${this.accountId}/webhooks/${webhook.id}/rotate-secret`, { method: 'POST' });
      this.notice = `Segredo rotacionado: ${result.secret}`;
    },
    async deleteWebhook(webhook) {
      if (!window.confirm('Excluir este webhook?')) return;
      await request(`/api/v1/accounts/${this.accountId}/webhooks/${webhook.id}`, { method: 'DELETE' });
      await this.loadAdminData();
    },
    async retryWebhook(delivery) {
      await request(`/api/v1/accounts/${this.accountId}/webhooks/deliveries/${delivery.id}/retry`, { method: 'POST' });
      this.notice = 'Entrega reenfileirada.';
      await this.loadAdminData();
    },
    async reprocessDeadLetter(job) {
      await request(`/api/v1/accounts/${this.accountId}/webhooks/dead-letter/${job.id}/reprocess`, { method: 'POST' });
      this.notice = 'Job da dead-letter reenfileirado.';
      await this.loadAdminData();
    },
    connectRealtime() {
      if (this.realtimeSocket) return;
      const token = localStorage.getItem('chatsalles_jwt');
      if (!token) return;
      this.realtimeSocket = connectRealtime(token, {
        'message:created': message => this.handleRealtimeMessage('created', message),
        'message:updated': message => this.handleRealtimeMessage('updated', message),
        'message:deleted': event => this.handleRealtimeMessage('deleted', event),
        'conversation:status_updated': event => this.handleRealtimeConversation(event),
        'conversation:priority_updated': event => this.handleRealtimeConversation(event),
        'conversation:assignment_updated': event => this.handleRealtimeConversation(event),
        'conversation:inbox_updated': event => this.handleRealtimeConversation(event),
        'conversation:read_updated': event => this.handleRealtimeRead(event),
      });
    },
    handleRealtimeMessage(action, event) {
      if (event.conversation_id !== this.selectedConversation?.id) {
        this.loadConversations();
        return;
      }
      if (action === 'created') this.messages.push(event);
      if (action === 'updated') {
        const index = this.messages.findIndex(message => message.id === event.id);
        if (index >= 0) this.messages.splice(index, 1, event);
      }
      if (action === 'deleted') this.messages = this.messages.filter(message => message.id !== event.messageId);
      this.loadConversations();
    },
    handleRealtimeConversation(event) {
      const index = this.conversations.findIndex(conversation => conversation.id === event.id);
      if (index >= 0) this.conversations.splice(index, 1, { ...this.conversations[index], ...event });
      if (this.selectedConversation?.id === event.id) Object.assign(this.selectedConversation, event);
    },
    handleRealtimeRead(event) {
      const conversation = this.conversations.find(item => item.id === event.conversationId);
      if (conversation) conversation.unread_count = event.unreadCount;
      if (this.selectedConversation?.id === event.conversationId) {
        this.selectedConversation.unread_count = event.unreadCount;
      }
    },
    async loadContacts() {
      if (!this.accountId) return;
      this.contactLoading = true;
      this.contactError = '';
      try {
        const params = new URLSearchParams({ page: '1' });
        if (this.contactSearch.trim()) params.set('q', this.contactSearch.trim());
        const result = await request(`/api/v1/accounts/${this.accountId}/contacts?${params}`);
        this.contacts = result.data || result.payload || [];
      } catch (error) {
        this.contactError = error.message;
      } finally {
        this.contactLoading = false;
      }
    },
    async loadInboxes() {
      if (!this.accountId) return;
      try {
        const result = await request(`/api/v1/accounts/${this.accountId}/inboxes`);
        this.inboxes = result.data || result.payload || result;
      } catch (error) {
        this.error = error.message;
      }
    },
    openContactModal() {
      this.contactForm = { name: '', email: '', phoneNumber: '' };
      this.contactError = '';
      this.editingContactId = null;
      this.contactModal = true;
    },
    editContact(contact) {
      this.contactForm = {
        name: contact.name || '',
        email: contact.email || '',
        phoneNumber: contact.phone_number || contact.phoneNumber || '',
      };
      this.editingContactId = contact.id;
      this.contactError = '';
      this.contactModal = true;
    },
    async createContact() {
      this.contactLoading = true;
      this.contactError = '';
      try {
        const isEditing = Boolean(this.editingContactId);
        const path = isEditing
          ? `/api/v1/accounts/${this.accountId}/contacts/${this.editingContactId}`
          : `/api/v1/accounts/${this.accountId}/contacts`;
        const contact = await request(path, {
          method: isEditing ? 'PATCH' : 'POST',
          body: JSON.stringify(this.contactForm),
        });
        if (isEditing) {
          const index = this.contacts.findIndex(item => item.id === contact.id);
          if (index >= 0) this.contacts.splice(index, 1, contact);
        } else {
          this.contacts.unshift(contact);
        }
        this.contactModal = false;
        this.notice = isEditing ? 'Contato atualizado.' : 'Contato criado.';
      } catch (error) {
        this.contactError = error.message;
      } finally {
        this.contactLoading = false;
      }
    },
    async deleteContact(contact) {
      if (!window.confirm(`Excluir o contato ${contact.name}?`)) return;
      try {
        await request(`/api/v1/accounts/${this.accountId}/contacts/${contact.id}`, { method: 'DELETE' });
        this.contacts = this.contacts.filter(item => item.id !== contact.id);
        this.notice = 'Contato excluído.';
      } catch (error) {
        this.contactError = error.message;
      }
    },
    async createConversation(contact) {
      this.creatingConversation = true;
      this.contactError = '';
      try {
        const conversation = await request(`/api/v1/accounts/${this.accountId}/conversations`, {
          method: 'POST',
          body: JSON.stringify({ contactId: contact.id, status: 'open' }),
        });
        this.view = 'conversations';
        this.page = 1;
        await this.loadConversations();
        await this.selectConversation(conversation);
        this.notice = 'Conversa criada.';
      } catch (error) {
        this.contactError = error.message;
      } finally {
        this.creatingConversation = false;
      }
    },
    async loadConversations() {
      if (!this.accountId) return;
      this.loading = true;
      this.error = '';
      try {
        const params = new URLSearchParams({
          page: String(this.page),
          sort_by: this.sort,
        });
        if (this.status) params.set('status', this.status);
        if (this.priority) params.set('priority', this.priority);
        if (this.labels.trim()) params.set('labels', this.labels.trim());
        const result = await request(`/api/v1/accounts/${this.accountId}/conversations?${params}`);
        this.conversations = result.data || result.payload || [];
        this.total = Number(result.meta?.count || this.conversations.length);
        if (this.selectedConversation) {
          const current = this.conversations.find(
            conversation => conversation.id === this.selectedConversation.id
          );
          if (current) await this.selectConversation(current);
        }
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    async selectConversation(conversation) {
      if (this.realtimeSocket && this.selectedConversation?.id) {
        this.realtimeSocket.emit('conversation:unsubscribe', this.selectedConversation.id);
      }
      this.selectedConversation = conversation;
      this.realtimeSocket?.emit('conversation:subscribe', conversation.id);
      this.messages = [];
      try {
        const [result, labels] = await Promise.all([
          request(`/api/v1/accounts/${this.accountId}/conversations/${conversation.id}/messages`),
          request(`/api/v1/accounts/${this.accountId}/conversations/${conversation.id}/labels`),
        ]);
        this.messages = result.data || result.payload || [];
        this.conversationLabels = labels.payload || labels.data || [];
        this.labelDraft = this.conversationLabels.join(', ');
        await this.markConversationRead();
      } catch (error) {
        this.error = error.message;
      }
    },
    async markConversationRead() {
      if (!this.selectedConversation) return;
      await request(`/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/update_last_seen`, { method: 'POST' });
      this.selectedConversation.unread_count = 0;
      this.notice = 'Conversa marcada como lida.';
    },
    async markConversationUnread() {
      if (!this.selectedConversation) return;
      await request(`/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/unread`, { method: 'POST' });
      this.selectedConversation.unread_count = 1;
      this.notice = 'Conversa marcada como não lida.';
    },
    async updateConversation(path, body) {
      if (!this.selectedConversation) return;
      try {
        const updated = await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/${path}`,
          { method: 'POST', body: JSON.stringify(body) }
        );
        Object.assign(this.selectedConversation, updated);
        this.notice = 'Conversa atualizada.';
        await this.loadConversations();
      } catch (error) {
        this.error = error.message;
      }
    },
    async updateConversationInbox(inboxId) {
      if (!this.selectedConversation) return;
      try {
        const updated = await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/inbox`,
          { method: 'POST', body: JSON.stringify({ inbox_id: inboxId || null }) },
        );
        Object.assign(this.selectedConversation, updated);
        this.notice = 'Inbox atualizada.';
        await this.loadConversations();
      } catch (error) {
        this.error = error.message;
      }
    },
    async saveConversationLabels() {
      if (!this.selectedConversation) return;
      try {
        const labels = this.labelDraft.split(',').map(label => label.trim()).filter(Boolean);
        const result = await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/labels`,
          { method: 'POST', body: JSON.stringify({ labels }) }
        );
        this.conversationLabels = result.payload || labels;
      } catch (error) {
        this.error = error.message;
      }
    },
    async loadAssignmentOptions() {
      try {
        const [agents, teams] = await Promise.all([
          request(`/api/v1/accounts/${this.accountId}/agents`),
          request(`/api/v1/accounts/${this.accountId}/teams`),
        ]);
        this.agents = agents.data || agents.payload || agents;
        this.teams = teams.data || teams.payload || teams;
      } catch (error) {
        this.error = error.message;
      }
    },
    async assignConversation(type, id) {
      await this.updateConversation('assignments', type === 'team'
        ? { assignee_type: 'team', assignee_id: id }
        : { assignee_type: id ? 'user' : 'unassigned', assignee_id: id || null });
    },
    async assignConversationEvent({ type, id }) {
      await this.assignConversation(type, id);
    },
    async sendMessage() {
      if (!this.draft.trim() || !this.selectedConversation || this.sending) return;
      this.sending = true;
      this.error = '';
      try {
        const body = this.attachmentFile || this.privateDraft
          ? (() => {
            const form = new FormData();
            form.append('content', this.draft.trim() || (this.attachmentFile ? '[Attachment]' : ''));
            form.append('private', String(this.privateDraft));
            if (this.attachmentFile) form.append('attachments[]', this.attachmentFile);
            return form;
          })()
          : JSON.stringify({ content: this.draft.trim(), private: false });
        const message = await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/messages`,
          {
            method: 'POST',
            body,
          }
        );
        this.messages.push(message);
        this.draft = '';
        this.privateDraft = false;
        this.attachmentFile = null;
        this.$refs.attachmentInput.value = '';
        await this.loadConversations();
      } catch (error) {
        this.error = error.message;
      } finally {
        this.sending = false;
      }
    },
    onAttachmentSelected(event) {
      this.attachmentFile = event.target.files?.[0] || null;
    },
    async retryMessage(message) {
      try {
        const result = await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/messages/${message.id}/retry`,
          { method: 'POST' },
        );
        Object.assign(message, result);
      } catch (error) {
        this.error = error.message;
      }
    },
    async deleteMessage(message) {
      if (!window.confirm('Excluir esta mensagem?')) return;
      try {
        await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}/messages/${message.id}`,
          { method: 'DELETE' },
        );
        this.messages = this.messages.filter(item => item.id !== message.id);
        this.notice = 'Mensagem excluída.';
      } catch (error) {
        this.error = error.message;
      }
    },
    async deleteConversation() {
      if (!this.selectedConversation || !window.confirm('Excluir esta conversa?')) return;
      try {
        await request(
          `/api/v1/accounts/${this.accountId}/conversations/${this.selectedConversation.id}`,
          { method: 'DELETE' },
        );
        this.conversations = this.conversations.filter(item => item.id !== this.selectedConversation.id);
        this.selectedConversation = null;
        this.messages = [];
        this.notice = 'Conversa excluída.';
        await this.loadConversations();
      } catch (error) {
        this.error = error.message;
      }
    },
    applyFilters() {
      this.page = 1;
      this.loadConversations();
    },
    changePage(page) {
      if (page < 1 || page > this.totalPages) return;
      this.page = page;
      this.loadConversations();
    },
    logout() {
      if (this.adminRefreshTimer) window.clearInterval(this.adminRefreshTimer);
      this.adminRefreshTimer = null;
      this.realtimeSocket?.disconnect();
      this.realtimeSocket = null;
      localStorage.removeItem('chatsalles_jwt');
      this.loggedIn = false;
      this.accountId = '';
      this.conversations = [];
      this.contacts = [];
      this.selectedConversation = null;
    },
    unmounted() {
      if (this.adminRefreshTimer) window.clearInterval(this.adminRefreshTimer);
    },
  },
  /*
    <main class="shell">
      <section v-if="!loggedIn" class="login-card">
        <div class="brand">Chat<span>Salles</span></div>
        <p class="muted">Frontend Node.js independente do Rails</p>
        <form @submit.prevent="login">
          <label>E-mail<input v-model="email" type="email" required /></label>
          <label>Senha<input v-model="password" type="password" required /></label>
          <button :disabled="loading">{{ loading ? 'Entrando...' : 'Entrar' }}</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      </section>

      <section v-else class="workspace">
        <header>
          <div><div class="brand">Chat<span>Salles</span></div><small>{{ view === 'contacts' ? 'Contatos' : 'Conversas' }}</small></div>
          <div class="header-actions">
            <button class="secondary" :class="{ active: view === 'conversations' }" @click="view = 'conversations'">Conversas</button>
            <button class="secondary" :class="{ active: view === 'contacts' }" @click="view = 'contacts'">Contatos</button>
            <button class="secondary" @click="logout">Sair</button>
          </div>
        </header>
        <div v-if="view === 'conversations'" class="toolbar">
          <select v-model="status" @change="applyFilters">
            <option value="">Todos os status</option><option value="open">Abertas</option>
            <option value="pending">Pendentes</option><option value="resolved">Resolvidas</option>
          </select>
          <select v-model="priority" @change="applyFilters">
            <option value="">Todas as prioridades</option><option value="1">Alta</option>
            <option value="2">Urgente</option>
          </select>
          <input v-model="labels" placeholder="Labels (ex.: sales, vip)" @keyup.enter="applyFilters" />
          <select v-model="sort" @change="applyFilters">
            <option value="updated_at">Mais recentes</option><option value="created_at">Mais antigas</option>
            <option value="priority">Prioridade</option><option value="alphabetical">Alfabética</option>
          </select>
          <button @click="applyFilters">Filtrar</button>
        </div>
        <section v-if="view === 'contacts'" class="contacts-view">
          <div class="contacts-toolbar">
            <input v-model="contactSearch" placeholder="Buscar contato..." @keyup.enter="loadContacts" />
            <button class="secondary" @click="loadContacts">Buscar</button>
            <button @click="openContactModal">Novo contato</button>
          </div>
          <p v-if="contactError" class="error">{{ contactError }}</p>
          <div v-if="contactLoading" class="empty">Carregando contatos...</div>
          <div v-else-if="!contacts.length" class="empty">Nenhum contato encontrado.</div>
          <div v-else class="contact-list">
            <article v-for="contact in contacts" :key="contact.id" class="contact-card">
              <div class="avatar">{{ contact.name.slice(0, 1).toUpperCase() }}</div>
              <div class="contact-info">
                <strong>{{ contact.name }}</strong>
                <small>{{ contact.email || contact.phone_number || 'Sem dados adicionais' }}</small>
              </div>
              <button :disabled="creatingConversation" @click="createConversation(contact)">Nova conversa</button>
              <button class="secondary" @click="editContact(contact)">Editar</button>
              <button class="danger" @click="deleteContact(contact)">Excluir</button>
            </article>
          </div>
          <div v-if="contactModal" class="modal-backdrop">
            <form class="modal" @submit.prevent="createContact">
              <h2>{{ editingContactId ? 'Editar contato' : 'Novo contato' }}</h2>
              <label>Nome<input v-model="contactForm.name" required /></label>
              <label>E-mail<input v-model="contactForm.email" type="email" /></label>
              <label>Telefone<input v-model="contactForm.phoneNumber" /></label>
              <p v-if="contactError" class="error">{{ contactError }}</p>
              <div class="modal-actions">
                <button type="button" class="secondary" @click="contactModal = false">Cancelar</button>
                <button :disabled="contactLoading">Salvar</button>
              </div>
            </form>
          </div>
        </section>
        <p v-if="error" class="error">{{ error }}</p>
        <template v-if="view === 'conversations'">
          <div class="summary">{{ total }} conversa(s) encontrada(s)</div>
          <div v-if="loading" class="empty">Carregando...</div>
          <div v-else-if="!conversations.length" class="empty">Nenhuma conversa encontrada.</div>
          <div v-else class="conversation-layout">
          <div class="conversation-list">
            <article v-for="conversation in conversations" :key="conversation.id"
              class="conversation" :class="{ selected: selectedConversation?.id === conversation.id }"
              @click="selectConversation(conversation)">
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
          <section v-if="selectedConversation" class="message-panel">
            <div class="message-header">
              <div>
                <strong>{{ selectedConversation.contact_name || 'Conversa ' + selectedConversation.id.slice(0, 8) }}</strong>
                <small class="message-subtitle">{{ selectedConversation.contact_email || selectedConversation.contact_phone || '' }}</small>
              </div>
              <small>{{ selectedConversation.status }}</small>
            </div>
            <div class="conversation-context">
              <span v-if="selectedConversation.inbox_name">Inbox: {{ selectedConversation.inbox_name }}</span>
              <span v-if="selectedConversation.assignee_email">Agente: {{ selectedConversation.assignee_email }}</span>
              <span v-if="selectedConversation.team_name">Equipe: {{ selectedConversation.team_name }}</span>
              <span>Não lidas: {{ selectedConversation.unread_count || 0 }}</span>
              <button class="secondary compact" @click="markConversationRead">Marcar lida</button>
              <button class="secondary compact" @click="markConversationUnread">Marcar não lida</button>
              <button class="danger compact" @click="deleteConversation">Excluir conversa</button>
            </div>
            <div class="conversation-actions">
              <select :value="selectedConversation.inbox_id || ''" @change="updateConversationInbox($event.target.value)">
                <option value="">Sem inbox</option>
                <option v-for="inbox in inboxes" :key="inbox.id" :value="inbox.id">{{ inbox.name }}</option>
              </select>
              <select :value="selectedConversation.status" @change="updateConversation('toggle_status', { status: $event.target.value })">
                <option value="open">Aberta</option><option value="pending">Pendente</option><option value="resolved">Resolvida</option>
              </select>
              <select :value="selectedConversation.priority || 0" @change="updateConversation('toggle_priority', { priority: Number($event.target.value) })">
                <option value="0">Sem prioridade</option><option value="1">Alta</option><option value="2">Urgente</option><option value="3">Crítica</option>
              </select>
              <input v-model="labelDraft" placeholder="labels: sales, vip" @keyup.enter="saveConversationLabels" />
              <button class="secondary" @click="saveConversationLabels">Salvar labels</button>
            </div>
            <div class="conversation-actions">
              <select @focus="loadAssignmentOptions" @change="assignConversation('user', $event.target.value)">
                <option value="">Atribuir agente...</option>
                <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.email }}</option>
              </select>
              <select @focus="loadAssignmentOptions" @change="assignConversation('team', $event.target.value)">
                <option value="">Atribuir equipe...</option>
                <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
              </select>
              <button class="secondary compact" @click="assignConversation('unassigned', null)">Remover atribuição</button>
            </div>
            <div class="messages">
              <div v-for="message in messages" :key="message.id" class="message">
                <p>{{ message.content }}</p>
                <small>{{ message.private ? 'Nota privada' : 'Mensagem' }} · {{ message.status }}</small>
                <div class="message-actions">
                  <button v-if="message.status !== 'sent'" class="secondary compact" @click="retryMessage(message)">Tentar novamente</button>
                  <button class="danger compact" @click="deleteMessage(message)">Excluir</button>
                </div>
              </div>
              <p v-if="!messages.length" class="empty">Nenhuma mensagem ainda.</p>
            </div>
            <form class="composer" @submit.prevent="sendMessage">
              <input v-model="draft" placeholder="Escreva uma mensagem..." :disabled="sending" />
              <label class="file-button">Anexar<input ref="attachmentInput" type="file" @change="onAttachmentSelected" /></label>
              <label class="private-toggle"><input v-model="privateDraft" type="checkbox" /> Nota privada</label>
              <button :disabled="sending || (!draft.trim() && !attachmentFile)">{{ sending ? 'Enviando...' : 'Enviar' }}</button>
            </form>
            <small v-if="attachmentFile" class="attachment-name">Arquivo: {{ attachmentFile.name }}</small>
          </section>
          </div>
          <nav class="pagination">
            <button class="secondary" :disabled="page === 1" @click="changePage(page - 1)">Anterior</button>
            <span>Página {{ page }} de {{ totalPages }}</span>
            <button class="secondary" :disabled="page === totalPages" @click="changePage(page + 1)">Próxima</button>
          </nav>
        </template>
      </section>
    </main>
  */
  template: appTemplate,
};

if (typeof document !== 'undefined' && document.querySelector('#app')) {
  createApp(App).mount('#app');
}
