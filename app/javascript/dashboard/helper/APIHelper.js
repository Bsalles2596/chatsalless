import Auth from '../api/auth';

const parseErrorCode = error => Promise.reject(error);

export default axios => {
  const { apiHost = '' } = window.chatwootConfig || {};
  const wootApi = axios.create({ baseURL: `${apiHost}/` });
  const nodeAuthEnabled = import.meta.env.VITE_NODE_AUTH === 'true';

  wootApi.interceptors.request.use(config => {
    const token = window.localStorage.getItem('chatsalles_jwt');
    if (nodeAuthEnabled && token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  if (Auth.hasAuthCookie()) {
    const {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    } = Auth.getAuthData();
    Object.assign(wootApi.defaults.headers.common, {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    });
  }

  wootApi.interceptors.response.use(
    response => response,
    error => parseErrorCode(error)
  );
  return wootApi;
};
