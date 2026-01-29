import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

/**
 * Hook para conectarse a un namespace de Socket.IO con auth del dashboard.
 * Un solo socket para todo el panel (estilo WhatsApp Web).
 * @param {string} namespace - Namespace de Socket.IO (ej: '/chat')
 * @returns {{socket: Socket|null, connected: boolean}}
 */
export function useSocket(namespace) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;

    const socket = io(namespace, {
      path: '/socket.io/',
      auth: { dashboardToken: token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log(`Dashboard socket conectado a ${namespace}`);
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log(`Dashboard socket desconectado: ${reason}`);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Error de conexión Socket.IO:', error.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [namespace, token]);

  return { socket: socketRef.current, connected };
}
