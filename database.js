const { Pool } = require('pg');
require('dotenv').config();

// Для Render используем DATABASE_URL
const connectionString = process.env.DATABASE_URL || undefined;

const pool = new Pool(
  connectionString
    ? {
        connectionString: connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }
);

pool.on('connect', () => {
  console.log('✅ База данных подключена');
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к базе данных:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
