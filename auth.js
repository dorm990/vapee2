const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Middleware для проверки JWT токена
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await db.query(
      'SELECT id, telegram_id, role, store_id FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(403).json({ error: 'Пользователь не найден' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// Middleware для проверки роли
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    next();
  };
};

// Middleware для проверки Telegram WebApp данных
const validateTelegramWebAppData = (req, res, next) => {
  // В production здесь должна быть валидация initData от Telegram
  // Для примера пропускаем
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  validateTelegramWebAppData
};
