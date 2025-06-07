
import axios from 'axios';

// ✅ FORCE PRODUCTION: Just use nginx proxy
const API_URL = '/api';  // ✅ Always use nginx proxy in production builds

console.log('🔍 API Service URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;