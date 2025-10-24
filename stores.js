const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

// Получение списка магазинов
router.get('/', async (req, res) => {
  try {
    const { city } = req.query;

    let query = 'SELECT * FROM stores WHERE is_active = true';
    const params = [];

    if (city) {
      query += ' AND city = $1';
      params.push(city);
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);

    res.json({
      success: true,
      stores: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения магазинов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение информации о конкретном магазине
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM stores WHERE id = $1 AND is_active = true',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Магазин не найден' });
    }

    res.json({
      success: true,
      store: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения магазина:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение статистики магазина (для кассиров и админов)
router.get('/:id/statistics', authenticateToken, requireRole('cashier', 'admin'), async (req, res) => {
  try {
    const storeId = req.params.id;

    // Проверка доступа кассира только к своему магазину
    if (req.user.role === 'cashier' && req.user.store_id !== parseInt(storeId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Общая статистика
    const statsResult = await db.query(
      `SELECT 
        COUNT(DISTINCT t.user_id) as total_customers,
        COUNT(CASE WHEN t.type = 'purchase' THEN 1 END) as total_purchases,
        COUNT(CASE WHEN t.type = 'device_return' THEN 1 END) as total_devices,
        COUNT(CASE WHEN t.type = 'reward_exchange' THEN 1 END) as total_rewards,
        SUM(CASE WHEN t.type = 'purchase' THEN t.points ELSE 0 END) as total_points_earned,
        SUM(CASE WHEN t.type = 'reward_exchange' THEN ABS(t.points) ELSE 0 END) as total_points_spent
       FROM transactions t
       WHERE t.store_id = $1`,
      [storeId]
    );

    // Статистика за последние 30 дней
    const recentStatsResult = await db.query(
      `SELECT 
        COUNT(DISTINCT t.user_id) as customers_last_30_days,
        COUNT(CASE WHEN t.type = 'device_return' THEN 1 END) as devices_last_30_days
       FROM transactions t
       WHERE t.store_id = $1 
       AND t.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [storeId]
    );

    // Топ-5 клиентов по баллам
    const topCustomersResult = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.points,
              COUNT(t.id) as transaction_count
       FROM users u
       JOIN transactions t ON u.id = t.user_id
       WHERE t.store_id = $1
       GROUP BY u.id, u.first_name, u.last_name, u.points
       ORDER BY u.points DESC
       LIMIT 5`,
      [storeId]
    );

    res.json({
      success: true,
      statistics: {
        ...statsResult.rows[0],
        ...recentStatsResult.rows[0],
        top_customers: topCustomersResult.rows
      }
    });
  } catch (error) {
    console.error('Ошибка получения статистики магазина:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение транзакций магазина
router.get('/:id/transactions', authenticateToken, requireRole('cashier', 'admin'), async (req, res) => {
  try {
    const storeId = req.params.id;
    const { limit = 50, offset = 0, type } = req.query;

    // Проверка доступа кассира только к своему магазину
    if (req.user.role === 'cashier' && req.user.store_id !== parseInt(storeId)) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    let query = `
      SELECT t.*, 
             u.first_name, u.last_name, u.telegram_id,
             c.first_name as cashier_first_name, c.last_name as cashier_last_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN users c ON t.cashier_id = c.id
      WHERE t.store_id = $1
    `;
    const params = [storeId];

    if (type) {
      query += ' AND t.type = $' + (params.length + 1);
      params.push(type);
    }

    query += ' ORDER BY t.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await db.query(query, params);

    const countQuery = type 
      ? 'SELECT COUNT(*) FROM transactions WHERE store_id = $1 AND type = $2'
      : 'SELECT COUNT(*) FROM transactions WHERE store_id = $1';
    const countParams = type ? [storeId, type] : [storeId];
    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Ошибка получения транзакций магазина:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
