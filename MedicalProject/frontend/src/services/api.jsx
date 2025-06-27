// filepath: src/services/api.js
import axios from 'axios';
import sessionManager from './sessionManager';

// ✅ Use environment variable with correct port
const API_URL = '/api';

console.log('🔍 API Service URL:', API_URL); // Debug log

// Create an axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  // ✅ Remove withCredentials since we're not using cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// ✅ Add request interceptor to include token from sessionManager
api.interceptors.request.use(
  async (config) => {
    // Try to refresh token if needed
    await sessionManager.refreshTokenIfNeeded();
    
    // Get token from sessionManager
    const token = sessionManager.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ✅ Updated response interceptor to use sessionManager
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized errors (session expired)
    if (error.response && error.response.status === 401) {
      // ✅ Clear session using sessionManager
      sessionManager.clearSession();
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;