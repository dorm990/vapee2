const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

// Применяем middleware для всех маршрутов
router.use(authenticateToken);
router.use(requireRole('admin'));

// Общая статистика по всей сети
router.get('/statistics/overview', async (req, res) => {
  try {
    // Общие метрики
    const overviewResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'client') as total_users,
        (SELECT COUNT(*) FROM stores WHERE is_active = true) as total_stores,
        (SELECT COUNT(*) FROM devices) as total_devices_collected,
        (SELECT COUNT(*) FROM transactions WHERE type = 'purchase') as total_purchases,
        (SELECT COUNT(*) FROM reward_redemptions WHERE status = 'completed') as total_rewards_redeemed,
        (SELECT SUM(points) FROM transactions WHERE type IN ('purchase', 'device_return')) as total_points_issued
    `);

    // Статистика за последние 30 дней
    const recentResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as new_users_last_30_days,
        (SELECT COUNT(*) FROM devices WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as devices_last_30_days,
        (SELECT COUNT(*) FROM transactions WHERE type = 'purchase' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days') as purchases_last_30_days
    `);

    res.json({
      success: true,
      overview: overviewResult.rows[0],
      recent: recentResult.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения общей статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика по географии
router.get('/statistics/geography', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.city,
        COUNT(DISTINCT t.user_id) as total_users,
        COUNT(CASE WHEN t.type = 'device_return' THEN 1 END) as devices_collected,
        COUNT(CASE WHEN t.type = 'purchase' THEN 1 END) as purchases_count,
        SUM(CASE WHEN t.type = 'purchase' THEN t.points ELSE 0 END) as points_issued
      FROM stores s
      LEFT JOIN transactions t ON s.id = t.store_id
      WHERE s.is_active = true
      GROUP BY s.city
      ORDER BY devices_collected DESC
    `);

    res.json({
      success: true,
      geography: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения географической статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика по магазинам
router.get('/statistics/stores', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.id,
        s.name,
        s.city,
        COUNT(DISTINCT t.user_id) as total_customers,
        COUNT(CASE WHEN t.type = 'device_return' THEN 1 END) as devices_collected,
        COUNT(CASE WHEN t.type = 'purchase' THEN 1 END) as purchases_count,
        COUNT(CASE WHEN t.type = 'reward_exchange' THEN 1 END) as rewards_redeemed,
        SUM(CASE WHEN t.points > 0 THEN t.points ELSE 0 END) as points_issued
      FROM stores s
      LEFT JOIN transactions t ON s.id = t.store_id
      WHERE s.is_active = true
      GROUP BY s.id, s.name, s.city
      ORDER BY devices_collected DESC
    `);

    res.json({
      success: true,
      stores: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения статистики по магазинам:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Динамика по дням
router.get('/statistics/timeline', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(CASE WHEN type = 'purchase' THEN 1 END) as purchases,
        COUNT(CASE WHEN type = 'device_return' THEN 1 END) as devices,
        COUNT(CASE WHEN type = 'reward_exchange' THEN 1 END) as rewards,
        SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as points_earned
      FROM transactions
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      timeline: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения динамики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление наградами

// Создание новой награды
router.post('/rewards', async (req, res) => {
  try {
    const { title, description, points_cost, category, image_url, stock_quantity } = req.body;

    if (!title || !points_cost) {
      return res.status(400).json({ error: 'Не указаны обязательные параметры' });
    }

    const result = await db.query(
      `INSERT INTO rewards (title, description, points_cost, category, image_url, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description, points_cost, category, image_url, stock_quantity]
    );

    res.json({
      success: true,
      reward: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка создания награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление награды
router.put('/rewards/:id', async (req, res) => {
  try {
    const { title, description, points_cost, category, image_url, stock_quantity, is_active } = req.body;

    const result = await db.query(
      `UPDATE rewards 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           points_cost = COALESCE($3, points_cost),
           category = COALESCE($4, category),
           image_url = COALESCE($5, image_url),
           stock_quantity = COALESCE($6, stock_quantity),
           is_active = COALESCE($7, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [title, description, points_cost, category, image_url, stock_quantity, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Награда не найдена' });
    }

    res.json({
      success: true,
      reward: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка обновления награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление награды (деактивация)
router.delete('/rewards/:id', async (req, res) => {
  try {
    await db.query(
      'UPDATE rewards SET is_active = false WHERE id = $1',
      [req.params.id]
    );

    res.json({
      success: true,
      message: 'Награда деактивирована'
    });
  } catch (error) {
    console.error('Ошибка удаления награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Управление акциями

// Создание акции
router.post('/promotions', async (req, res) => {
  try {
    const { title, description, multiplier, start_date, end_date, store_id } = req.body;

    if (!title || !multiplier || !start_date || !end_date) {
      return res.status(400).json({ error: 'Не указаны обязательные параметры' });
    }

    const result = await db.query(
      `INSERT INTO promotions (title, description, multiplier, start_date, end_date, store_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description, multiplier, start_date, end_date, store_id]
    );

    res.json({
      success: true,
      promotion: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка создания акции:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение списка всех пользователей
router.get('/users', async (req, res) => {
  try {
    const { role, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT id, telegram_id, first_name, last_name, username, email, phone, role, points, store_id, created_at FROM users';
    const params = [];

    if (role) {
      query += ' WHERE role = $1';
      params.push(role);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Экспорт отчета
router.get('/export/report', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Получаем все необходимые данные для отчета
    const reportData = await db.query(`
      SELECT 
        t.*,
        u.first_name, u.last_name, u.email, u.phone,
        s.name as store_name, s.city,
        c.first_name as cashier_first_name, c.last_name as cashier_last_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN stores s ON t.store_id = s.id
      LEFT JOIN users c ON t.cashier_id = c.id
      WHERE t.created_at >= COALESCE($1::timestamp, CURRENT_TIMESTAMP - INTERVAL '30 days')
        AND t.created_at <= COALESCE($2::timestamp, CURRENT_TIMESTAMP)
      ORDER BY t.created_at DESC
    `, [start_date, end_date]);

    res.json({
      success: true,
      report: reportData.rows,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Ошибка экспорта отчета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
