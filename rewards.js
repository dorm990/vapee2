const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendNotification } = require('../bot/telegram-bot');
const router = express.Router();

// Получение каталога наград
router.get('/', async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;

    let query = 'SELECT * FROM rewards WHERE is_active = true';
    const params = [];

    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }

    query += ' ORDER BY points_cost ASC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      success: true,
      rewards: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения наград:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение одной награды
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM rewards WHERE id = $1 AND is_active = true',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Награда не найдена' });
    }

    res.json({
      success: true,
      reward: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обмен баллов на награду
router.post('/:id/redeem', authenticateToken, async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Получение информации о награде
    const rewardResult = await client.query(
      'SELECT * FROM rewards WHERE id = $1 AND is_active = true FOR UPDATE',
      [req.params.id]
    );

    if (rewardResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Награда не найдена' });
    }

    const reward = rewardResult.rows[0];

    // Проверка наличия на складе
    if (reward.stock_quantity !== null && reward.stock_quantity <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Награда закончилась' });
    }

    // Получение баланса пользователя
    const userResult = await client.query(
      'SELECT points, telegram_id FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );

    const user = userResult.rows[0];

    // Проверка достаточности баллов
    if (user.points < reward.points_cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Недостаточно баллов',
        required: reward.points_cost,
        available: user.points
      });
    }

    // Генерация QR-кода
    const qrCode = uuidv4();
    const qrCodeImage = await QRCode.toDataURL(qrCode);

    // Создание записи об обмене
    const redemptionResult = await client.query(
      `INSERT INTO reward_redemptions (user_id, reward_id, qr_code, points_spent, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [req.user.id, reward.id, qrCode, reward.points_cost]
    );

    // Списание баллов
    await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2',
      [reward.points_cost, req.user.id]
    );

    // Создание транзакции
    await client.query(
      `INSERT INTO transactions (user_id, type, points, description)
       VALUES ($1, 'reward_exchange', $2, $3)`,
      [req.user.id, -reward.points_cost, `Обмен на: ${reward.title}`]
    );

    // Уменьшение количества на складе
    if (reward.stock_quantity !== null) {
      await client.query(
        'UPDATE rewards SET stock_quantity = stock_quantity - 1 WHERE id = $1',
        [reward.id]
      );
    }

    // Создание уведомления
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.id,
        'Награда получена! 🎁',
        `Вы обменяли ${reward.points_cost} баллов на "${reward.title}"`,
        'reward_available'
      ]
    );

    await client.query('COMMIT');

    // Отправка уведомления в Telegram
    sendNotification(
      user.telegram_id,
      `🎁 Награда получена!\n\n` +
      `Вы обменяли ${reward.points_cost} баллов на:\n"${reward.title}"\n\n` +
      `Покажите QR-код кассиру в магазине для получения награды.\n\n` +
      `📱 QR-код доступен в приложении`
    );

    res.json({
      success: true,
      redemption: {
        ...redemptionResult.rows[0],
        reward_title: reward.title,
        qr_code_image: qrCodeImage
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка обмена награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Получение списка обменов пользователя
router.get('/redemptions/my', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT rr.*, r.title as reward_title, r.description as reward_description,
              r.image_url, s.name as store_name
       FROM reward_redemptions rr
       JOIN rewards r ON rr.reward_id = r.id
       LEFT JOIN stores s ON rr.store_id = s.id
       WHERE rr.user_id = $1
       ORDER BY rr.created_at DESC`,
      [req.user.id]
    );

    // Генерация QR-кодов для активных обменов
    const redemptions = await Promise.all(
      result.rows.map(async (redemption) => {
        if (redemption.status === 'pending') {
          const qrCodeImage = await QRCode.toDataURL(redemption.qr_code);
          return { ...redemption, qr_code_image: qrCodeImage };
        }
        return redemption;
      })
    );

    res.json({
      success: true,
      redemptions
    });
  } catch (error) {
    console.error('Ошибка получения обменов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Подтверждение выдачи награды (только для кассиров)
router.post('/redemptions/:qr_code/confirm', authenticateToken, requireRole('cashier', 'admin'), async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Поиск обмена по QR-коду
    const redemptionResult = await client.query(
      `SELECT rr.*, u.telegram_id 
       FROM reward_redemptions rr
       JOIN users u ON rr.user_id = u.id
       WHERE rr.qr_code = $1 AND rr.status = 'pending' FOR UPDATE`,
      [req.params.qr_code]
    );

    if (redemptionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Обмен не найден или уже завершен' });
    }

    const redemption = redemptionResult.rows[0];

    // Обновление статуса обмена
    await client.query(
      `UPDATE reward_redemptions 
       SET status = 'completed', 
           store_id = $1,
           redeemed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.store_id, redemption.id]
    );

    // Создание уведомления
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [
        redemption.user_id,
        'Награда выдана! ✅',
        'Ваша награда успешно получена',
        'reward_available'
      ]
    );

    await client.query('COMMIT');

    // Отправка уведомления
    sendNotification(
      redemption.telegram_id,
      `✅ Награда выдана!\n\nВаша награда успешно получена. Спасибо за участие в программе лояльности!`
    );

    res.json({
      success: true,
      message: 'Награда успешно выдана'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ошибка подтверждения выдачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

module.exports = router;
