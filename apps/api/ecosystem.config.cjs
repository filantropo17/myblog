// API 的 PM2 ecosystem 配置文件
module.exports = {
  apps: [
    {
      name: 'myblog-api',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        DB_PATH: '/data/myblog.db',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
