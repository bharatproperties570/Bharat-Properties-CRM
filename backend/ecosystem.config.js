module.exports = {
  apps: [{
    name: 'bharat-crm-backend',
    script: './src/server.js',
    cwd: '/home/ubuntu/bharat-crm-releases/current',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
