/* global axios */
import ApiClient from '../ApiClient';
import { usesNodeBackend } from '../backendConfig';

const nodeFilterPayload = payload => {
  const filters = payload.queryData?.payload || payload.queryData || [];
  if (!Array.isArray(filters)) return payload.queryData;

  return filters.reduce((result, filter) => {
    const filterMap = {
      status: 'status',
      priority: 'priority',
      inbox_id: 'inbox_id',
      team_id: 'team_id',
      assignee_id: 'assignee_id',
      labels: 'labels',
    };
    const key = filterMap[filter.attribute_key];
    if (!key || !filter.values?.length) return result;
    return {
      ...result,
      [key]: key === 'labels'
        ? filter.values.map(label => label.id ?? label)
        : filter.values[0].id ?? filter.values[0],
    };
  }, {});
};

class ConversationApi extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  get(
    {
      inboxId,
      status,
      assigneeType,
      page,
      labels,
      teamId,
      conversationType,
      sortBy,
      updatedWithin,
      priority,
    },
    options = {}
  ) {
    return axios.get(this.url, {
      signal: options.signal,
      params: {
        inbox_id: inboxId,
        team_id: teamId,
        status,
        assignee_type: assigneeType,
        page,
        labels,
        conversation_type: conversationType,
        sort_by: sortBy,
        updated_within: updatedWithin,
        priority,
      },
    });
  }

  filter(payload, options = {}) {
    const data = usesNodeBackend('conversations')
      ? nodeFilterPayload(payload)
      : payload.queryData;
    return axios.post(`${this.url}/filter`, data, {
      signal: options.signal,
      params: {
        page: payload.page,
      },
    });
  }

  search({ q }) {
    return axios.get(`${this.url}/search`, {
      params: {
        q,
        page: 1,
      },
    });
  }

  toggleStatus({ conversationId, status, snoozedUntil = null }) {
    return axios.post(`${this.url}/${conversationId}/toggle_status`, {
      status,
      snoozed_until: snoozedUntil,
    });
  }

  togglePriority({ conversationId, priority }) {
    return axios.post(`${this.url}/${conversationId}/toggle_priority`, {
      priority,
    });
  }

  assignAgent({ conversationId, agentId, assigneeType }) {
    return axios.post(`${this.url}/${conversationId}/assignments`, {
      assignee_id: agentId,
      assignee_type: assigneeType,
    });
  }

  assignTeam({ conversationId, teamId }) {
    const params = { team_id: teamId };
    return axios.post(`${this.url}/${conversationId}/assignments`, params);
  }

  markMessageRead({ id }) {
    return axios.post(`${this.url}/${id}/update_last_seen`);
  }

  markMessagesUnread({ id }) {
    return axios.post(`${this.url}/${id}/unread`);
  }

  toggleTyping({ conversationId, status, isPrivate }) {
    return axios.post(`${this.url}/${conversationId}/toggle_typing_status`, {
      typing_status: status,
      is_private: isPrivate,
    });
  }

  mute(conversationId) {
    return axios.post(`${this.url}/${conversationId}/mute`);
  }

  unmute(conversationId) {
    return axios.post(`${this.url}/${conversationId}/unmute`);
  }

  meta({ inboxId, status, assigneeType, labels, teamId, conversationType }) {
    return axios.get(`${this.url}/meta`, {
      params: {
        inbox_id: inboxId,
        status,
        assignee_type: assigneeType,
        labels,
        team_id: teamId,
        conversation_type: conversationType,
      },
    });
  }

  sendEmailTranscript({ conversationId, email }) {
    return axios.post(`${this.url}/${conversationId}/transcript`, { email });
  }

  requestContactInfo(conversationId) {
    return axios.post(`${this.url}/${conversationId}/contact_info_request`);
  }

  updateCustomAttributes({ conversationId, customAttributes }) {
    return axios.post(`${this.url}/${conversationId}/custom_attributes`, {
      custom_attributes: customAttributes,
    });
  }

  fetchParticipants(conversationId) {
    return axios.get(`${this.url}/${conversationId}/participants`);
  }

  updateParticipants({ conversationId, userIds }) {
    return axios.patch(`${this.url}/${conversationId}/participants`, {
      user_ids: userIds,
    });
  }

  getAllAttachments(conversationId) {
    return axios.get(`${this.url}/${conversationId}/attachments`);
  }

  getInboxAssistant(conversationId) {
    return axios.get(`${this.url}/${conversationId}/inbox_assistant`);
  }

  delete(conversationId) {
    return axios.delete(`${this.url}/${conversationId}`);
  }
}

export default new ConversationApi();
