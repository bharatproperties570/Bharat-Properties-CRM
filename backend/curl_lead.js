const http = require('http');

const data = JSON.stringify({
  firstName: 'API',
  lastName: 'TestLead',
  mobile: '9416035571',
  companyId: '6991ad69e07eb3dd7dd4667a',
  sourceMeta: { search: '?type=Meeting' }
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/leads',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  res.on('data', d => process.stdout.write(d));
});
req.on('error', error => console.error(error));
req.write(data);
req.end();
