const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'postgres' // Подключаемся к БД по умолчанию
    });

    try {
        console.log('🔄 Проверка существования базы данных...');
        
        // Проверка существования базы данных
        const checkDb = await pool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [process.env.DB_NAME]
        );

        if (checkDb.rows.length === 0) {
            console.log('📦 Создание базы данных...');
            await pool.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log('✅ База данных создана');
        } else {
            console.log('✅ База данных уже существует');
        }

        await pool.end();

        // Подключение к созданной базе данных
        const appPool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        });

        console.log('🔄 Выполнение SQL скрипта...');
        
        // Чтение и выполнение SQL скрипта
        const sqlScript = fs.readFileSync(
            path.join(__dirname, '..', 'database', 'init.sql'),
            'utf8'
        );

        // Удаляем команду создания базы данных из скрипта
        const cleanedScript = sqlScript
            .replace(/CREATE DATABASE.*?;/gi, '')
            .replace(/\\c.*?;/gi, '');

        await appPool.query(cleanedScript);
        
        console.log('✅ База данных инициализирована успешно!');
        
        // Вывод статистики
        const stats = await appPool.query(`
            SELECT 
                (SELECT COUNT(*) FROM stores) as stores_count,
                (SELECT COUNT(*) FROM rewards) as rewards_count
        `);
        
        console.log('\n📊 Статистика:');
        console.log(`   Магазинов: ${stats.rows[0].stores_count}`);
        console.log(`   Наград: ${stats.rows[0].rewards_count}`);
        
        await appPool.end();
        
    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error.message);
        process.exit(1);
    }
}

initDatabase();
