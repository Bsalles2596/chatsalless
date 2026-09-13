/* global axios */

import Cookies from 'js-cookie';
import endPoints from './endPoints';
import {
  clearCookiesOnLogout,
  deleteIndexedDBOnLogout,
} from '../store/utils/api';

export default {
  validityCheck() {
    if (import.meta.env.VITE_NODE_AUTH === 'true') {
      const nodeBackendUrl = import.meta.env.VITE_NODE_BACKEND_URL || '';
      return axios.get(`${nodeBackendUrl}/api/v1/auth/me`);
    }
    const urlData = endPoints('validityCheck');
    return axios.get(urlData.url);
  },
  logout() {
    if (import.meta.env.VITE_NODE_AUTH === 'true') {
      window.localStorage.removeItem('chatsalles_jwt');
      clearCookiesOnLogout();
      return Promise.resolve();
    }
    const urlData = endPoints('logout');
    const fetchPromise = new Promise((resolve, reject) => {
      axios
        .delete(urlData.url)
        .then(response => {
          deleteIndexedDBOnLogout();
          clearCookiesOnLogout();
          resolve(response);
        })
        .catch(error => {
          reject(error);
        });
    });
    return fetchPromise;
  },
  hasAuthCookie() {
    if (import.meta.env.VITE_NODE_AUTH === 'true') {
      return !!window.localStorage.getItem('chatsalles_jwt');
    }
    return !!Cookies.get('cw_d_session_info');
  },
  getAuthData() {
    if (import.meta.env.VITE_NODE_AUTH === 'true') {
      return { token: window.localStorage.getItem('chatsalles_jwt') };
    }
    if (this.hasAuthCookie()) {
      const savedAuthInfo = Cookies.get('cw_d_session_info');
      return JSON.parse(savedAuthInfo || '{}');
    }
    return false;
  },
  profileUpdate({ displayName, avatar, ...profileAttributes }) {
    const formData = new FormData();
    Object.keys(profileAttributes).forEach(key => {
      const hasValue = profileAttributes[key] === undefined;
      if (!hasValue) {
        formData.append(`profile[${key}]`, profileAttributes[key]);
      }
    });
    formData.append('profile[display_name]', displayName || '');
    if (avatar) {
      formData.append('profile[avatar]', avatar);
    }
    return axios.put(endPoints('profileUpdate').url, formData);
  },

  profilePasswordUpdate({ currentPassword, password, passwordConfirmation }) {
    return axios.put(endPoints('profileUpdate').url, {
      profile: {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      },
    });
  },

  updateUISettings({ uiSettings }) {
    return axios.put(endPoints('profileUpdate').url, {
      profile: { ui_settings: uiSettings },
    });
  },

  updateAvailability(availabilityData) {
    return axios.post(endPoints('availabilityUpdate').url, {
      profile: { ...availabilityData },
    });
  },

  updateAutoOffline(accountId, autoOffline = false) {
    return axios.post(endPoints('autoOffline').url, {
      profile: { account_id: accountId, auto_offline: autoOffline },
    });
  },

  deleteAvatar() {
    return axios.delete(endPoints('deleteAvatar').url);
  },

  resetPassword({ email }) {
    const urlData = endPoints('resetPassword');
    return axios.post(urlData.url, { email });
  },

  setActiveAccount({ accountId }) {
    const urlData = endPoints('setActiveAccount');
    return axios.put(urlData.url, {
      profile: {
        account_id: accountId,
      },
    });
  },
  resendConfirmation() {
    const urlData = endPoints('resendConfirmation');
    return axios.post(urlData.url);
  },
  resetAccessToken() {
    const urlData = endPoints('resetAccessToken');
    return axios.post(urlData.url);
  },
  getSessions() {
    return axios.get('/api/v1/profile/sessions');
  },
  revokeSession(id) {
    return axios.delete(`/api/v1/profile/sessions/${id}`);
  },
};
