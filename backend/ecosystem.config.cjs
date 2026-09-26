module.exports = {
    apps: [
        {
            name: "bharat-crm-backend",
            script: "./src/server.js",
            kill_timeout: 65000,
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
