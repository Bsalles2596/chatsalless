import { io } from 'socket.io-client';

const backendUrl = import.meta.env.VITE_NODE_BACKEND_URL || 'http://localhost:3001';

export const connectRealtime = (token, handlers) => {
  const socket = io(backendUrl, {
    auth: { token },
    reconnection: true,
    autoConnect: true,
  });

  for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
  return socket;
};
