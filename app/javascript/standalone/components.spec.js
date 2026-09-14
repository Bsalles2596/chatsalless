import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ConversationList } from './components/ConversationList';
import { ContactForm } from './components/ContactForm';
import { MessagePanel } from './components/MessagePanel';
import { AutomationAdminView } from './views/AutomationAdminView';
import { WebhookAdminView } from './views/WebhookAdminView';
import { OperationsAdminView } from './views/OperationsAdminView';

describe('ChatSalles standalone components', () => {
  it('emits the selected conversation', async () => {
    const wrapper = mount(ConversationList, {
      props: {
        conversations: [{ id: 'conversation-1', contact_id: 'contact-1', status: 'open' }],
      },
    });

    await wrapper.find('.conversation').trigger('click');

    expect(wrapper.emitted('select')).toEqual([[wrapper.props('conversations')[0]]]);
  });

  it('emits contact form updates and submission', async () => {
    const wrapper = mount(ContactForm, {
      props: {
        open: true,
        form: { name: 'Maria', email: '', phoneNumber: '' },
      },
    });

    await wrapper.find('input').setValue('Maria Silva');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('update:form')?.[0][0]).toMatchObject({ name: 'Maria Silva' });
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('emits message actions with their payloads', async () => {
    const wrapper = mount(MessagePanel, {
      props: {
        conversation: { id: 'conversation-1', status: 'open', priority: 0 },
        messages: [{ id: 'message-1', content: 'Falhou', status: 'failed' }],
        inboxes: [{ id: 'inbox-1', name: 'WhatsApp' }],
        agents: [],
        teams: [],
        labelDraft: '',
        draft: '',
        privateDraft: false,
      },
    });

    await wrapper.find('.message-actions button').trigger('click');
    await wrapper.find('.conversation-actions select').setValue('inbox-1');

    expect(wrapper.emitted('retry')?.[0][0].id).toBe('message-1');
    expect(wrapper.emitted('inbox')).toEqual([['inbox-1']]);
  });

  it('emits automation filters and pagination events', async () => {
    const wrapper = mount(AutomationAdminView, {
      props: {
        rules: [],
        executions: [{ id: 'execution-1', event_name: 'message.created', status: 'succeeded' }],
        form: { name: '', eventName: 'message.created', actionStatus: '', conditions: '', actions: '' },
        page: 1,
        totalPages: 2,
        eventFilter: '',
        statusFilter: '',
      },
    });

    await wrapper.find('.admin-filters input').setValue('message');
    await wrapper.find('.pagination button:last-child').trigger('click');

    expect(wrapper.emitted('update:event-filter')?.[0]).toEqual(['message']);
    expect(wrapper.emitted('page')).toEqual([[2]]);
  });

  it('emits webhook status filters and retry actions', async () => {
    const wrapper = mount(WebhookAdminView, {
      props: {
        webhooks: [],
        deliveries: [{ id: 'delivery-1', event_name: 'message.created', status: 'failed', attempts: 4 }],
        form: { name: '', url: '', events: '' },
        page: 1,
        totalPages: 1,
        eventFilter: '',
        statusFilter: '',
      },
    });

    await wrapper.find('.admin-filters select').setValue('failed');
    await wrapper.find('.admin-list button').trigger('click');

    expect(wrapper.emitted('update:status-filter')?.[0]).toEqual(['failed']);
    expect(wrapper.emitted('retry')?.[0][0].id).toBe('delivery-1');
  });

  it('emits inbox and team administration actions', async () => {
    const wrapper = mount(OperationsAdminView, {
      props: {
        inboxes: [{ id: 'inbox-1', name: 'Suporte', channelType: 'web_widget' }],
        teams: [{ id: 'team-1', name: 'Comercial' }],
        inboxForm: { name: '', channelType: 'api' },
        teamForm: { name: '', description: '' },
        providerConfig: null,
        providerForm: { inboxId: 'inbox-1', provider: 'web_widget', enabled: false, credentials: '' },
      },
    });

    await wrapper.find('.admin-form input').setValue('WhatsApp');
    await wrapper.find('.admin-form select').setValue('whatsapp');
    await wrapper.findAll('.admin-form')[0].trigger('submit.prevent');
    await wrapper.findAll('.admin-list button')[0].trigger('click');

    expect(wrapper.emitted('update:inbox-form')?.at(-1)?.[0]).toMatchObject({ channelType: 'whatsapp' });
    expect(wrapper.emitted('create-inbox')).toHaveLength(1);
    expect(wrapper.emitted('select-inbox')?.[0]).toEqual(['inbox-1']);
    await wrapper.find('textarea').setValue('{"token":"test"}');
    await wrapper.findAll('.admin-form').at(-1).trigger('submit.prevent');
    expect(wrapper.emitted('configure-provider')).toHaveLength(1);
  });
});
