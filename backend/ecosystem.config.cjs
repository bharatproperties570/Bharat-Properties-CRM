module.exports = {
    apps: [
        {
            name: "bharat-crm-backend",
            script: "./launcher.mjs",
            cwd: "/home/ubuntu/bharat-crm-runtime",
            instances: 1,
            exec_mode: "fork",
            kill_timeout: 65000,
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
