module.exports = {
  apps: [
    {
      name: 'cad-bot',
      script: './src/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 4000,
      min_uptime: '10s',
      max_restarts: 15,
      env: {
        NODE_ENV: 'production',
        PORT: 3008,
        HEADLESS: 'false'
      },
      env_headless: {
        NODE_ENV: 'production',
        PORT: 3008,
        HEADLESS: 'true'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      combine_logs: true
    }
  ]
};
