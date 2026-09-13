import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ConversationList } from './components/ConversationList';
import { ContactForm } from './components/ContactForm';
import { MessagePanel } from './components/MessagePanel';
import { AutomationAdminView } from './views/AutomationAdminView';
import { WebhookAdminView } from './views/WebhookAdminView';

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
});
