import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './main';

const jsonResponse = body => ({
  ok: true,
  json: async () => body,
});

describe('ChatSalles standalone SPA', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs in and loads contacts and conversations from Node', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url.endsWith('/auth/login')) return jsonResponse({ token: 'jwt-token' });
      if (url.endsWith('/auth/me')) {
        return jsonResponse({ payload: { data: { account_id: 'account-1' } } });
      }
      if (url.includes('/contacts')) {
        return jsonResponse({ payload: [{ id: 'contact-1', name: 'Maria', email: 'maria@example.com' }] });
      }
      return jsonResponse({ data: [], meta: { count: 0 } });
    });
    const wrapper = mount(App);

    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(localStorage.getItem('chatsalles_jwt')).toBe('jwt-token');
    expect(wrapper.text()).toContain('Contatos');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/accounts/account-1/contacts'),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('creates a contact through the Node API', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/auth/me')) return jsonResponse({
        payload: { data: { account_id: 'account-1' } },
      });
      if (url.includes('/contacts') && options.method === 'POST') {
        return jsonResponse({ id: 'contact-2', name: 'Joao', email: 'joao@example.com' });
      }
      if (url.includes('/contacts')) return jsonResponse({ payload: [] });
      return jsonResponse({ data: [], meta: { count: 0 } });
    });
    const wrapper = mount(App);
    await flushPromises();
    const contactsTab = wrapper.findAll('button').find(button => button.text() === 'Contatos');
    await contactsTab.trigger('click');
    await flushPromises();
    const newContactButton = wrapper.findAll('button').find(button => button.text() === 'Novo contato');
    await newContactButton.trigger('click');
    await wrapper.get('input[required]').setValue('Joao');
    await wrapper.get('input[type="email"]').setValue('joao@example.com');
    await wrapper.get('.modal').trigger('submit.prevent');
    await flushPromises();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/accounts/account-1/contacts'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"Joao"'),
      }),
    );
  });

  it('sends private notes and attachments as FormData', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/auth/me')) return jsonResponse({
        payload: { data: { account_id: 'account-1' } },
      });
      if (url.includes('/messages') && options.method === 'POST') {
        expect(options.body).toBeInstanceOf(FormData);
        expect(options.body.get('private')).toBe('true');
        expect(options.body.get('attachments[]')).toBe(file);
        return jsonResponse({ id: 'message-1', content: 'nota', private: true, status: 'sent' });
      }
      if (url.includes('/messages')) return jsonResponse({ payload: [] });
      if (url.includes('/labels')) return jsonResponse({ payload: [] });
      return jsonResponse({ data: [{ id: 'conversation-1', contact_id: 'contact-1' }], meta: { count: 1 } });
    });
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.vm.selectConversation({ id: 'conversation-1', contact_id: 'contact-1' });
    wrapper.vm.draft = 'nota';
    wrapper.vm.privateDraft = true;
    wrapper.vm.attachmentFile = file;
    await wrapper.vm.sendMessage();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('calls read, unread, retry and delete endpoints', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ id: 'message-1', status: 'sent' }),
    );
    const wrapper = mount(App);
    await flushPromises();
    wrapper.vm.accountId = 'account-1';
    await wrapper.vm.selectConversation({ id: 'conversation-1', unread_count: 2 });
    const message = { id: 'message-1', status: 'failed' };

    await wrapper.vm.markConversationRead();
    await wrapper.vm.markConversationUnread();
    await wrapper.vm.retryMessage(message);
    window.confirm = vi.fn(() => true);
    await wrapper.vm.deleteMessage(message);
    await wrapper.vm.deleteConversation();

    const urls = fetchMock.mock.calls.map(call => call[0]);
    expect(urls.some(url => url.endsWith('/update_last_seen'))).toBe(true);
    expect(urls.some(url => url.endsWith('/unread'))).toBe(true);
    expect(urls.some(url => url.endsWith('/retry'))).toBe(true);
    expect(urls.some(url => url.endsWith('/messages/message-1'))).toBe(true);
    expect(urls.some(url => url.endsWith('/conversations/conversation-1'))).toBe(true);
  });

  it('loads inboxes and updates the selected conversation inbox', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/auth/me')) return jsonResponse({
        payload: { data: { account_id: 'account-1' } },
      });
      if (url.endsWith('/inboxes')) return jsonResponse([{ id: 'inbox-1', name: 'WhatsApp' }]);
      if (url.includes('/messages')) return jsonResponse({ payload: [] });
      if (url.includes('/labels')) return jsonResponse({ payload: [] });
      return jsonResponse({ data: [], meta: { count: 0 } });
    });
    const wrapper = mount(App);
    await flushPromises();
    wrapper.vm.selectedConversation = { id: 'conversation-1' };
    await wrapper.vm.updateConversationInbox('inbox-1');

    const inboxCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/inbox'));
    expect(inboxCall[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ inbox_id: 'inbox-1' }),
    });
    expect(wrapper.vm.notice).toBe('Inbox atualizada.');
  });

  it('applies combined filters and pagination through the conversation API', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ data: [], meta: { count: 41 } }),
    );
    const wrapper = mount(App);
    wrapper.vm.accountId = 'account-1';
    wrapper.vm.status = 'open';
    wrapper.vm.priority = '2';
    wrapper.vm.labels = 'vip, sales';
    wrapper.vm.sort = 'priority';
    wrapper.vm.page = 2;
    await wrapper.vm.loadConversations();

    const url = fetchMock.mock.calls.find(([requestUrl]) => requestUrl.includes('/conversations?'))[0];
    expect(url).toContain('page=2');
    expect(url).toContain('status=open');
    expect(url).toContain('priority=2');
    expect(url).toContain('labels=vip%2C+sales');
    expect(url).toContain('sort_by=priority');
    expect(wrapper.vm.totalPages).toBe(3);
  });

  it('edits and deletes contacts through the Node API', async () => {
    localStorage.setItem('chatsalles_jwt', 'jwt-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ id: 'contact-1', name: 'Maria Silva', email: 'maria@example.com' }),
    );
    const wrapper = mount(App);
    await flushPromises();
    wrapper.vm.accountId = 'account-1';
    wrapper.vm.contacts = [{ id: 'contact-1', name: 'Maria', email: 'maria@example.com' }];
    wrapper.vm.editContact(wrapper.vm.contacts[0]);
    wrapper.vm.contactForm.name = 'Maria Silva';
    await wrapper.vm.createContact();
    window.confirm = vi.fn(() => true);
    await wrapper.vm.deleteContact({ id: 'contact-1', name: 'Maria Silva' });

    const patchCall = fetchMock.mock.calls.find(([url, options]) => (
      url.includes('/contacts/contact-1') && options.method === 'PATCH'
    ));
    const deleteCall = fetchMock.mock.calls.find(([url, options]) => (
      url.includes('/contacts/contact-1') && options.method === 'DELETE'
    ));
    expect(patchCall).toBeTruthy();
    expect(deleteCall).toBeTruthy();
  });

  it('updates the selected unread counter from realtime events', () => {
    const wrapper = mount(App);
    wrapper.vm.conversations = [{ id: 'conversation-1', unread_count: 2 }];
    wrapper.vm.selectedConversation = wrapper.vm.conversations[0];

    wrapper.vm.handleRealtimeRead({
      conversationId: 'conversation-1',
      unreadCount: 0,
    });

    expect(wrapper.vm.conversations[0].unread_count).toBe(0);
    expect(wrapper.vm.selectedConversation.unread_count).toBe(0);
  });
});
