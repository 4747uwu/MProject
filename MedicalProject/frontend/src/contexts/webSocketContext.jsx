// Create: frontend/src/contexts/WebSocketContext.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }) => {
  const { currentUser } = useAuth();
  
  // WebSocket state
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [newStudyCount, setNewStudyCount] = useState(0);
  
  // Connection management
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef(null);
  const heartbeatInterval = useRef(null);
  const isManualDisconnect = useRef(false);
  const connectionTimeout = useRef(null);
  const isConnecting = useRef(false);
  const mounted = useRef(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('🧹 WebSocket Context cleanup...');
    
    isConnecting.current = false;
    
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    if (connectionTimeout.current) {
      clearTimeout(connectionTimeout.current);
      connectionTimeout.current = null;
    }
    
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
    
    if (ws.current) {
      const currentWs = ws.current;
      ws.current = null;
      
      if (currentWs.readyState === WebSocket.CONNECTING || currentWs.readyState === WebSocket.OPEN) {
        try {
          currentWs.close(1000, 'Context cleanup');
        } catch (error) {
          console.error('Error closing WebSocket during cleanup:', error);
        }
      }
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttempts.current = 0;
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }
    
    heartbeatInterval.current = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN && mounted.current) {
        try {
          ws.current.send(JSON.stringify({ type: 'heartbeat' }));
        } catch (error) {
          console.error('Error sending heartbeat:', error);
        }
      }
    }, 25000);
  }, []);

  const handleMessage = useCallback((message) => {
    if (!mounted.current) return;

    switch (message.type) {
      case 'connection_established':
        console.log('🎉 WebSocket connection established:', message.userInfo);
        
        // Subscribe to study notifications
        setTimeout(() => {
          if (ws.current && ws.current.readyState === WebSocket.OPEN && mounted.current) {
            ws.current.send(JSON.stringify({
              type: 'subscribe_to_studies'
            }));
          }
        }, 500);
        break;
        
      case 'subscribed':
        console.log('📋 Subscribed to study notifications');
        break;
        
      case 'new_study':
        const study = message.data;
        setNewStudyCount(prev => prev + 1);
        
        toast.success(
          `New Study: ${study.patientName}`,
          {
            duration: 6000,
            icon: '🏥',
            id: `new-study-${study.studyId}`,
            style: {
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
              border: '2px solid #22c55e',
              color: '#065f46',
              fontWeight: '600'
            }
          }
        );
        break;
        
      case 'study_status_change':
        const statusChange = message.data;
        toast(`Status Update: ${statusChange.patientName} - ${statusChange.newStatus}`, {
          duration: 4000,
          icon: '🔄',
          id: `status-${statusChange.studyId}`,
          style: {
            background: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)',
            border: '1px solid #f59e0b',
            color: '#78350f',
          }
        });
        break;
        
      case 'pong':
      case 'heartbeat_ack':
        // Heartbeat response
        break;
        
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }, []);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (isConnecting.current || !mounted.current) {
      console.log('🚫 WebSocket Context: Connection blocked - already connecting or unmounted');
      return;
    }

    if (!currentUser || currentUser.role !== 'admin') {
      console.log('❌ WebSocket Context: User is not admin or not logged in');
      setConnectionStatus('disconnected');
      return;
    }

    // Check existing connection
    if (ws.current && (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN)) {
      console.log('✅ WebSocket Context: Already connected/connecting - skipping');
      return;
    }

    isConnecting.current = true;
    setConnectionStatus('connecting');
    isManualDisconnect.current = false;
    
    const wsUrl = `ws://localhost:3000/ws/admin`;
    
    try {
      console.log('🔌 WebSocket Context: Creating connection...');
      
      // Close existing connection if any
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }

      ws.current = new WebSocket(wsUrl);

      // Connection timeout
      connectionTimeout.current = setTimeout(() => {
        if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
          console.log('❌ WebSocket Context: Connection timeout');
          ws.current.close();
          isConnecting.current = false;
        }
      }, 8000);

      ws.current.onopen = () => {
        if (!mounted.current) {
          console.log('🚫 WebSocket Context: Component unmounted during connection - closing');
          ws.current.close();
          return;
        }

        console.log('✅ WebSocket Context: Connected successfully');
        clearTimeout(connectionTimeout.current);
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        isConnecting.current = false;
        
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
        
        startHeartbeat();
      };

      ws.current.onmessage = (event) => {
        if (!mounted.current) return;
        
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('❌ WebSocket Context: Disconnected - Code', event.code, 'Reason:', event.reason || 'No reason');
        clearTimeout(connectionTimeout.current);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        isConnecting.current = false;
        
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
          heartbeatInterval.current = null;
        }
        
        if (!mounted.current || isManualDisconnect.current) {
          console.log('🚫 WebSocket Context: Not reconnecting - unmounted or manual disconnect');
          return;
        }
        
        // Don't reconnect on code 4008
        if (event.code === 4008) {
          console.log('🚫 WebSocket Context: Not reconnecting - server closed for new connection');
          return;
        }
        
        // Reconnect logic
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(3000 * reconnectAttempts.current, 15000);
          console.log(`🔄 WebSocket Context: Scheduling reconnect in ${delay/1000}s... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          setConnectionStatus('connecting');
          reconnectTimeout.current = setTimeout(() => {
            if (mounted.current && !isManualDisconnect.current) {
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('❌ WebSocket Context: Max reconnection attempts reached');
          setConnectionStatus('error');
          toast.error('Connection lost. Please refresh to reconnect.', {
            duration: 10000,
            id: 'websocket-error'
          });
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket Context: Error', error);
        clearTimeout(connectionTimeout.current);
        setConnectionStatus('error');
        isConnecting.current = false;
      };

    } catch (error) {
      console.error('WebSocket Context: Error creating connection', error);
      setConnectionStatus('error');
      isConnecting.current = false;
    }
  }, [currentUser, startHeartbeat, handleMessage]);

  const disconnect = useCallback(() => {
    console.log('🔌 WebSocket Context: Manually disconnecting...');
    isManualDisconnect.current = true;
    cleanup();
  }, [cleanup]);

  const reconnect = useCallback(() => {
    console.log('🔄 WebSocket Context: Manual reconnect requested');
    reconnectAttempts.current = 0;
    isManualDisconnect.current = false;
    disconnect();
    setTimeout(() => {
      if (mounted.current) {
        connect();
      }
    }, 2000);
  }, [connect, disconnect]);

  const resetNewStudyCount = useCallback(() => {
    setNewStudyCount(0);
  }, []);

  // Main effect - connect when user becomes admin
  useEffect(() => {
    mounted.current = true;
    
    console.log('🔄 WebSocket Context: Effect triggered', { 
      userId: currentUser?.id, 
      userRole: currentUser?.role 
    });

    if (currentUser && currentUser.role === 'admin') {
      // Delay connection to prevent rapid connections
      const connectTimer = setTimeout(() => {
        if (mounted.current) {
          connect();
        }
      }, 1500); // 1.5 second delay
      
      return () => {
        clearTimeout(connectTimer);
        cleanup();
      };
    } else {
      console.log('❌ WebSocket Context: User is not admin or not logged in');
      setConnectionStatus('disconnected');
      cleanup();
    }
  }, [currentUser?.id, currentUser?.role, connect, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 WebSocket Context: Provider unmounting');
      mounted.current = false;
      cleanup();
    };
  }, [cleanup]);

  const value = {
    isConnected,
    connectionStatus,
    newStudyCount,
    resetNewStudyCount,
    reconnect,
    disconnect
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};