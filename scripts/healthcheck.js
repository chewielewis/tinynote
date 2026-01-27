/**
 * TinyNote Health Check Script
 * Used by Docker HEALTHCHECK directive to verify server is running
 */

const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 4444,
  path: '/',
  timeout: 5000,
};

const request = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.error(`Health check failed: ${err.message}`);
  process.exit(1);
});

request.end();
