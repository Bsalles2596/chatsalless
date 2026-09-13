const apiUrl = import.meta.env.VITE_NODE_BACKEND_URL || 'http://localhost:3001';

export const request = async (path, options = {}) => {
  const token = localStorage.getItem('chatsalles_jwt');
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Não foi possível concluir a operação');
  return body;
};
