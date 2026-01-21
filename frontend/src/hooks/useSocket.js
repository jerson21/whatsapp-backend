import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

/**
 * Hook para conectarse a un namespace de Socket.IO
 * @param {string} namespace - Namespace de Socket.IO (ej: '/chat', '/monitor')
 * @param {number} sessionId - ID de la sesión
 * @param {string} token - Token de autenticación
 * @returns {{socket: Socket|null, connected: boolean}}
 */
export function useSocket(namespace, sessionId, token) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !token) return;

    // Conectar al namespace
    // Socket.IO usa /socket.io/ como path por defecto
    const socket = io(namespace, {
      path: '/socket.io/',
      auth: { sessionId, token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log(`Socket conectado a ${namespace}`);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log(`Socket desconectado de ${namespace}`);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Error de conexión Socket.IO:', error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [namespace, sessionId, token]);

  return { socket: socketRef.current, connected };
}
