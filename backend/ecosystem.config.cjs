module.exports = {
    apps: [
        {
            name: "bharat-crm-backend",
            script: "./launcher.mjs",
            cwd: "/home/ubuntu/bharat-crm-runtime",
            instances: 1,
            exec_mode: "fork",
            kill_timeout: 65000,
            max_memory_restart: "480M",
            node_args: "--max-old-space-size=450",
            exp_backoff_restart_delay: 100,
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
