const db = require('../config/database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
    try {
        console.log('🔄 Инициализация базы данных...');
        
        // Чтение SQL скрипта
        const sqlScript = fs.readFileSync(
            path.join(__dirname, '..', 'database', 'init.sql'),
            'utf8'
        );

        // Удаляем команды создания БД и подключения (они не нужны в Render)
        const cleanedScript = sqlScript
            .replace(/CREATE DATABASE.*?;/gi, '')
            .replace(/\\c.*?;/gi, '');

        // Выполнение скрипта
        await db.query(cleanedScript);
        
        console.log('✅ База данных инициализирована успешно!');
        
        // Вывод статистики
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM stores) as stores_count,
                (SELECT COUNT(*) FROM rewards) as rewards_count
        `);
        
        console.log('\n📊 Статистика:');
        console.log(`   Магазинов: ${stats.rows[0].stores_count}`);
        console.log(`   Наград: ${stats.rows[0].rewards_count}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error.message);
        console.error(error);
        process.exit(1);
    }
}

initDatabase();
