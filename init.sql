-- Создание базы данных
CREATE DATABASE vape_loyalty;

-- Подключение к базе данных
\c vape_loyalty;

-- Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    phone VARCHAR(20),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    username VARCHAR(100),
    role VARCHAR(20) DEFAULT 'client', -- client, cashier, admin
    points INTEGER DEFAULT 0,
    store_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица магазинов
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица транзакций (начисления и списания баллов)
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    store_id INTEGER REFERENCES stores(id),
    type VARCHAR(20) NOT NULL, -- purchase, device_return, reward_exchange
    points INTEGER NOT NULL,
    description TEXT,
    receipt_number VARCHAR(100),
    cashier_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица устройств (сданные вейпы)
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    store_id INTEGER REFERENCES stores(id),
    device_type VARCHAR(100),
    brand VARCHAR(100),
    points_earned INTEGER,
    photo_url TEXT,
    status VARCHAR(20) DEFAULT 'received', -- received, processed, recycled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица наград
CREATE TABLE rewards (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    points_cost INTEGER NOT NULL,
    category VARCHAR(50), -- discount, gift, merchandise
    image_url TEXT,
    stock_quantity INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица обменов наград
CREATE TABLE reward_redemptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    reward_id INTEGER REFERENCES rewards(id),
    store_id INTEGER REFERENCES stores(id),
    qr_code VARCHAR(100) UNIQUE,
    points_spent INTEGER,
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, cancelled
    redeemed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица акций
CREATE TABLE promotions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    multiplier DECIMAL(3, 2) DEFAULT 1.0,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    store_id INTEGER REFERENCES stores(id), -- NULL для всех магазинов
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица уведомлений
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50), -- points_earned, promotion, reward_available
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации запросов
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_store_id ON transactions(store_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_store_id ON devices(store_id);
CREATE INDEX idx_reward_redemptions_user_id ON reward_redemptions(user_id);
CREATE INDEX idx_reward_redemptions_qr_code ON reward_redemptions(qr_code);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Вставка тестовых данных
INSERT INTO stores (name, address, city, phone) VALUES
('VapeShop Центр', 'ул. Пушкина, 10', 'Москва', '+7 (495) 123-45-67'),
('VapeShop Север', 'пр. Мира, 25', 'Москва', '+7 (495) 234-56-78'),
('VapeShop Юг', 'ул. Ленина, 5', 'Санкт-Петербург', '+7 (812) 345-67-89');

INSERT INTO rewards (title, description, points_cost, category, stock_quantity) VALUES
('Скидка 10%', 'Скидка 10% на следующую покупку', 100, 'discount', 1000),
('Скидка 20%', 'Скидка 20% на следующую покупку', 200, 'discount', 500),
('Бесплатная жидкость', 'Бесплатная жидкость 30мл на выбор', 300, 'gift', 200),
('Фирменная футболка', 'Футболка с логотипом бренда', 500, 'merchandise', 100),
('Фирменная кепка', 'Кепка с логотипом бренда', 400, 'merchandise', 150),
('Premium устройство', 'Премиальное устройство последней модели', 1000, 'gift', 50);
