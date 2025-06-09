// 🔧 DIGITAL OCEAN: backend/healthcheck.js
import http from 'http';

const options = {
  hostname: '64.227.187.164',
  port: 3000,
  path: '/api/health',
  method: 'GET',
  timeout: 5000
};

const healthCheck = http.request(options, (res) => {
  console.log(`[DIGITAL OCEAN] Health check status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log('✅ Digital Ocean server is healthy');
    process.exit(0);
  } else {
    console.error('❌ Digital Ocean server health check failed');
    process.exit(1);
  }
});

healthCheck.on('error', (err) => {
  console.error('❌ Digital Ocean health check failed:', err.message);
  process.exit(1);
});

healthCheck.on('timeout', () => {
  console.error('❌ Digital Ocean health check timed out');
  healthCheck.destroy();
  process.exit(1);
});

healthCheck.end();