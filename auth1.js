const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const router = express.Router();

// Вход/регистрация через Telegram
router.post('/telegram', async (req, res) => {
  try {
    const { telegram_id, first_name, last_name, username, phone, email } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'Не указан telegram_id' });
    }

    // Проверка существующего пользователя
    let userResult = await db.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegram_id]
    );

    let user;

    if (userResult.rows.length === 0) {
      // Создание нового пользователя
      const insertResult = await db.query(
        `INSERT INTO users (telegram_id, first_name, last_name, username, phone, email, role) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [telegram_id, first_name, last_name, username, phone, email, 'client']
      );
      user = insertResult.rows[0];
    } else {
      // Обновление данных существующего пользователя
      const updateResult = await db.query(
        `UPDATE users 
         SET first_name = $1, last_name = $2, username = $3, 
             phone = COALESCE($4, phone), email = COALESCE($5, email),
             updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = $6 RETURNING *`,
        [first_name, last_name, username, phone, email, telegram_id]
      );
      user = updateResult.rows[0];
    }

    // Генерация JWT токена
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        role: user.role,
        points: user.points,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера при авторизации' });
  }
});

// Обновление профиля
router.post('/update-profile', async (req, res) => {
  try {
    const { telegram_id, phone, email } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'Не указан telegram_id' });
    }

    const result = await db.query(
      `UPDATE users 
       SET phone = COALESCE($1, phone), 
           email = COALESCE($2, email),
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $3 
       RETURNING id, telegram_id, first_name, last_name, username, role, points, phone, email`,
      [phone, email, telegram_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления профиля:', error);
    res.status(500).json({ error: 'Ошибка сервера при обновлении профиля' });
  }
});

module.exports = router;
