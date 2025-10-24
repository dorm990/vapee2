const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Получение профиля текущего пользователя
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, telegram_id, first_name, last_name, username, 
              phone, email, role, points, store_id, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение баланса пользователя
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT points FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ success: true, points: result.rows[0].points });
  } catch (error) {
    console.error('Ошибка получения баланса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение истории транзакций пользователя
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT t.*, s.name as store_name, 
              u.first_name as cashier_first_name, u.last_name as cashier_last_name
       FROM transactions t
       LEFT JOIN stores s ON t.store_id = s.id
       LEFT JOIN users u ON t.cashier_id = u.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) FROM transactions WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Ошибка получения истории:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение статистики пользователя
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const statsResult = await db.query(
      `SELECT 
        COUNT(CASE WHEN type = 'purchase' THEN 1 END) as total_purchases,
        COUNT(CASE WHEN type = 'device_return' THEN 1 END) as total_devices,
        COUNT(CASE WHEN type = 'reward_exchange' THEN 1 END) as total_rewards,
        SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as total_earned,
        SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END) as total_spent
       FROM transactions
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      statistics: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение уведомлений пользователя
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    const unreadCount = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      notifications: result.rows,
      unread_count: parseInt(unreadCount.rows[0].count)
    });
  } catch (error) {
    console.error('Ошибка получения уведомлений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отметить уведомление как прочитанное
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка обновления уведомления:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
