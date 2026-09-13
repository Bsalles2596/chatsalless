import axios from 'axios';

const { apiHost = '' } = window.chatwootConfig || {};
const wootAPI = axios.create({ baseURL: `${apiHost}/` });

wootAPI.interceptors.request.use(config => {
  const token = window.localStorage.getItem('chatsalles_jwt');
  const nodeAuthEnabled = import.meta.env.VITE_NODE_AUTH === 'true';
  if (nodeAuthEnabled && token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default wootAPI;
