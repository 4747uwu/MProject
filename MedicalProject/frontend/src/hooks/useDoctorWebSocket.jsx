// 🆕 NEW: hooks/useDoctorWebSocket.js
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'react-toastify';

export const useDoctorWebSocket = ({
    onNewAssignment,
    onConnectionChange,
    autoReconnect = true,
    enableToastNotifications = true,
    enableSoundNotifications = true
}) => {
    const { currentUser } = useAuth();
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [pendingStudies, setPendingStudies] = useState(null);
    const [lastNotification, setLastNotification] = useState(null);
    
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 5000; // 5 seconds

    // 🔧 FIXED: Use correct backend WebSocket URL
    const getWebSocketUrl = useCallback(() => {
        // Get the backend URL from environment or default
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        
        // Convert HTTP to WebSocket URL
        const wsUrl = backendUrl
            .replace('http://', 'ws://')
            .replace('https://', 'wss://');
            
        return `${wsUrl}/ws`;
    }, []);

    const connectWebSocket = useCallback(() => {
        if (!currentUser) {
            console.log('👨‍⚕️ WebSocket: No user logged in, skipping connection');
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('👨‍⚕️ WebSocket: Already connected');
            return;
        }

        const wsUrl = getWebSocketUrl();
        console.log('👨‍⚕️ WebSocket: Connecting to:', wsUrl);

        try {
            setConnectionStatus('connecting');
            onConnectionChange?.('connecting');

            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                console.log('✅ Doctor WebSocket connected successfully');
                setConnectionStatus('connected');
                onConnectionChange?.('connected');
                reconnectAttemptsRef.current = 0;

                // 🔧 AUTHENTICATE: Send authentication after connection
                if (currentUser) {
                    const authMessage = {
                        type: 'authenticate',
                        token: localStorage.getItem('token'), // or however you store the token
                        userId: currentUser._id || currentUser.id,
                        role: currentUser.role
                    };
                    
                    wsRef.current.send(JSON.stringify(authMessage));
                    console.log('🔐 Doctor WebSocket: Authentication sent');
                }

                // Request initial pending count
                requestPendingCount();
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('📨 Doctor WebSocket message received:', data);

                    switch (data.type) {
                        case 'study_assigned':
                            handleNewStudyAssignment(data);
                            break;
                        case 'pending_count':
                            setPendingStudies(data.count);
                            console.log(`📊 Updated pending studies count: ${data.count}`);
                            break;
                        case 'authentication_success':
                            console.log('✅ Doctor WebSocket authenticated successfully');
                            break;
                        case 'authentication_failed':
                            console.error('❌ Doctor WebSocket authentication failed');
                            setConnectionStatus('error');
                            onConnectionChange?.('error');
                            break;
                        default:
                            console.log('📨 Unknown message type:', data.type);
                    }
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error);
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('❌ Doctor WebSocket error:', error);
                setConnectionStatus('error');
                onConnectionChange?.('error');
            };

            wsRef.current.onclose = (event) => {
                console.log(`❌ Doctor WebSocket disconnected (Code: ${event.code}, Reason: ${event.reason})`);
                setConnectionStatus('disconnected');
                onConnectionChange?.('disconnected');

                // 🔧 AUTO-RECONNECT: Only if enabled and not intentional close
                if (autoReconnect && event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
                    console.log(`🔄 Attempting to reconnect in ${delay/1000} seconds...`);
                    
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        connectWebSocket();
                    }, delay);
                } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                    console.error('❌ Max reconnection attempts reached');
                    setConnectionStatus('error');
                    onConnectionChange?.('error');
                }
            };

        } catch (error) {
            console.error('❌ Error creating WebSocket connection:', error);
            setConnectionStatus('error');
            onConnectionChange?.('error');
        }
    }, [currentUser, autoReconnect, onConnectionChange, getWebSocketUrl]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        
        if (wsRef.current) {
            wsRef.current.close(1000, 'User initiated disconnect');
            wsRef.current = null;
        }
        
        setConnectionStatus('disconnected');
        onConnectionChange?.('disconnected');
    }, [onConnectionChange]);

    const sendMessage = useCallback((message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
            return true;
        }
        console.warn('WebSocket not connected, cannot send message');
        return false;
    }, []);

    const requestPendingCount = useCallback(() => {
        return sendMessage({ type: 'request_pending_count' });
    }, [sendMessage]);

    // Setup heartbeat
    useEffect(() => {
        if (connectionStatus === 'connected') {
            const heartbeatInterval = setInterval(() => {
                sendMessage({ type: 'heartbeat' });
            }, 30000); // Every 30 seconds

            return () => clearInterval(heartbeatInterval);
        }
    }, [connectionStatus, sendMessage]);

    // Auto-connect on mount and reconnect on user change
    useEffect(() => {
        if (currentUser?.role === 'doctor_account') {
            connectWebSocket();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
    }, [currentUser, connectWebSocket, disconnect]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        connectionStatus,
        isConnected: connectionStatus === 'connected',
        pendingStudies,
        lastNotification,
        requestPendingCount,
        disconnect
    };
};