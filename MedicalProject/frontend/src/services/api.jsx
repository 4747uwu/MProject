// filepath: src/services/api.js
import axios from 'axios';

// ✅ SUPER SIMPLE: Just check production mode
const API_URL = import.meta.env.VITE_NODE_ENV === 'production' 
  ? '/api'  // ✅ Always use nginx proxy in production
  : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/api`;

console.log('🔍 API Service URL:', API_URL);
console.log('🔍 VITE_NODE_ENV:', import.meta.env.VITE_NODE_ENV);
console.log('🔍 VITE_BACKEND_URL:', import.meta.env.VITE_BACKEND_URL);

// Create an axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized errors (session expired)
    if (error.response && error.response.status === 401) {
      // Redirect to login or refresh token logic here
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;