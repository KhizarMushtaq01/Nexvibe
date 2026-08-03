import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      return;
    }

    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('user:join', user._id);
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('users:online', (users) => setOnlineUsers(users));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?._id]);

  const emit = (event, data) => socketRef.current?.emit(event, data);
  const on = (event, cb) => { socketRef.current?.on(event, cb); return () => socketRef.current?.off(event, cb); };
  const off = (event, cb) => socketRef.current?.off(event, cb);
  const joinRoom = (room) => socketRef.current?.emit('conversation:join', room);
  const leaveRoom = (room) => socketRef.current?.emit('conversation:leave', room);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, onlineUsers, emit, on, off, joinRoom, leaveRoom }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
