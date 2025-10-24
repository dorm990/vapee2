const TelegramBot = require('node-telegram-bot-api');
const db = require('../config/database');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const firstName = msg.from.first_name;
  const lastName = msg.from.last_name || '';
  const username = msg.from.username || '';

  try {
    // Проверка существования пользователя
    const userCheck = await db.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (userCheck.rows.length === 0) {
      // Создание нового пользователя
      await db.query(
        `INSERT INTO users (telegram_id, first_name, last_name, username, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [telegramId, firstName, lastName, username, 'client']
      );
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Открыть приложение', web_app: { url: process.env.TELEGRAM_WEBAPP_URL } }],
        [{ text: '💰 Мой баланс', callback_data: 'balance' }],
        [{ text: '🎁 Каталог наград', callback_data: 'rewards' }],
        [{ text: '❓ Помощь', callback_data: 'help' }]
      ]
    };

    await bot.sendMessage(
      chatId,
      `👋 Привет, ${firstName}!\n\n` +
      `Добро пожаловать в программу лояльности по утилизации вейпов! 🌱\n\n` +
      `🔹 Получайте баллы за покупки\n` +
      `🔹 Зарабатывайте бонусы за сдачу устройств\n` +
      `🔹 Обменивайте баллы на награды\n\n` +
      `Нажмите кнопку ниже, чтобы открыть приложение:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Ошибка в /start:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Обработка callback запросов
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;
  const data = query.data;

  try {
    switch (data) {
      case 'balance':
        const userBalance = await db.query(
          'SELECT points FROM users WHERE telegram_id = $1',
          [telegramId]
        );
        
        if (userBalance.rows.length > 0) {
          await bot.sendMessage(
            chatId,
            `💰 Ваш баланс: ${userBalance.rows[0].points} баллов`
          );
        }
        break;

      case 'rewards':
        const rewards = await db.query(
          'SELECT title, points_cost FROM rewards WHERE is_active = true ORDER BY points_cost LIMIT 5'
        );
        
        let rewardsText = '🎁 Доступные награды:\n\n';
        rewards.rows.forEach(reward => {
          rewardsText += `• ${reward.title} - ${reward.points_cost} баллов\n`;
        });
        rewardsText += '\n📱 Откройте приложение для подробностей';
        
        await bot.sendMessage(chatId, rewardsText);
        break;

      case 'help':
        await bot.sendMessage(
          chatId,
          `❓ Как пользоваться:\n\n` +
          `1️⃣ Совершайте покупки и получайте баллы\n` +
          `2️⃣ Сдавайте старые устройства за дополнительные бонусы\n` +
          `3️⃣ Обменивайте баллы на призы в каталоге\n\n` +
          `📞 Поддержка: support@vape-loyalty.com`
        );
        break;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Ошибка в callback_query:', error);
    await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка' });
  }
});

// Отправка уведомлений
async function sendNotification(telegramId, message) {
  try {
    await bot.sendMessage(telegramId, message);
  } catch (error) {
    console.error('Ошибка отправки уведомления:', error);
  }
}

module.exports = { bot, sendNotification };
