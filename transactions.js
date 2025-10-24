const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendNotification } = require('../bot/telegram-bot');
const router = express.Router();

// Начисление баллов за покупку (только для кассиров)
router.post('/purchase', authenticateToken, requireRole('cashier', 'admin'), async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { user_telegram_id, receipt_number, amount } = req.body;

    if (!user_telegram_id || !amount) {
      return res.status(400).json({ error: 'Не указаны обязательные параметры' });
    }

    await client.query('BEGIN');

    // Получение пользователя
    const userResult = await client.query(
      'SELECT id, telegram_id FROM users WHERE telegram_id = $1',
      [user_telegram_id]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userId = userResult.rows[0].id;
    const telegramId = userResult.rows[0].telegram_id;

    // Проверка активных акций
    const promotionResult = await client.query(
      `SELECT multiplier FROM promotions
       WHERE is_active = true 
       AND (store_id = $1 OR store_id IS NULL)
       AND start_date <= CURRENT_TIMESTAMP
       AND end_date >= CURRENT_TIMESTAMP
       ORDER BY multiplier DESC
       LIMIT 1`,
      [req.user.store_id]
    );

    const multiplier = promotionResult.rows.length > 0 
      ? parseFloat(promotionResult.rows[0].multiplier) 
      : 1.0;

    // Расчет баллов
    const basePoints = Math.floor(amount / 100) * parseInt(process.env.POINTS_PER_PURCHASE || 10);
    const points = Math.floor(basePoints * multiplier);

    // Обновление баланса пользователя
    await client.query(
      'UPDATE users SET points = points + $1 WHERE id = $2',
      [points, userId]
    );

    // Создание транзакции
    const transactionResult = await client.query(
      `INSERT INTO transactions (user_id, store_id, type, points, description, receipt_number, cashier_id)
       VALUES ($1, $2, 'purchase', $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        req.user.store_id,
        points,
        `Покупка на сумму ${amount} руб.`,
        receipt_number,
        req.user.id
      ]
    );

    // Создание уведомления
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        'Баллы начислены! 🎉',
        `Вам начислено ${points} баллов за покупку`,
        'points_earned'
      ]
    );

    await client.query('COMMIT');

    // Отправка уведомления в Telegram
    sendNotification(
      telegramId,
      `🎉 Баллы начислены!\n\n💰 +${points} баллов за покупку на сумму ${amount} руб.\n` +
      (multiplier > 1 ? `🔥 Акция х${multiplier}!\n` : '') +
      `\n📱 Откройте приложение чтобы увидеть баланс`
    );

    res.json({
      success: true,
      transaction: transactionResult.rows[0],
      points_earned: points
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка начисления баллов за покупку:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Начисление баллов за сдачу устройства (только для кассиров)
router.post('/device-return', authenticateToken, requireRole('cashier', 'admin'), async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { user_telegram_id, device_type, brand, photo_url } = req.body;

    if (!user_telegram_id) {
      return res.status(400).json({ error: 'Не указан telegram_id пользователя' });
    }

    await client.query('BEGIN');

    // Получение пользователя
    const userResult = await client.query(
      'SELECT id, telegram_id FROM users WHERE telegram_id = $1',
      [user_telegram_id]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userId = userResult.rows[0].id;
    const telegramId = userResult.rows[0].telegram_id;

    const points = parseInt(process.env.POINTS_PER_DEVICE || 50);

    // Обновление баланса
    await client.query(
      'UPDATE users SET points = points + $1 WHERE id = $2',
      [points, userId]
    );

    // Создание записи об устройстве
    const deviceResult = await client.query(
      `INSERT INTO devices (user_id, store_id, device_type, brand, points_earned, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, req.user.store_id, device_type, brand, points, photo_url]
    );

    // Создание транзакции
    await client.query(
      `INSERT INTO transactions (user_id, store_id, type, points, description, cashier_id)
       VALUES ($1, $2, 'device_return', $3, $4, $5)`,
      [
        userId,
        req.user.store_id,
        points,
        `Сдача устройства: ${device_type || 'вейп'} ${brand || ''}`,
        req.user.id
      ]
    );

    // Создание уведомления
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        'Баллы за утилизацию! ♻️',
        `Вам начислено ${points} баллов за сдачу устройства`,
        'points_earned'
      ]
    );

    await client.query('COMMIT');

    // Отправка уведомления в Telegram
    sendNotification(
      telegramId,
      `♻️ Спасибо за заботу об экологии!\n\n💰 +${points} баллов за сдачу устройства\n\n📱 Откройте приложение чтобы увидеть баланс`
    );

    res.json({
      success: true,
      device: deviceResult.rows[0],
      points_earned: points
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка начисления баллов за устройство:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

module.exports = router;
