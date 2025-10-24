// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// API конфигурация
const API_URL = window.location.origin + '/api';
let authToken = null;
let currentUser = null;

// Состояние приложения
const state = {
    balance: 0,
    rewards: [],
    transactions: [],
    statistics: {},
    currentPage: 'balance'
};

// Инициализация приложения
async function init() {
    try {
        // Авторизация через Telegram
        await authenticateUser();
        
        // Загрузка начальных данных
        await Promise.all([
            loadUserBalance(),
            loadUserStatistics(),
            loadRewards()
        ]);
        
        // Генерация QR-кода пользователя
        generateUserQRCode();
        
        // Настройка обработчиков событий
        setupEventListeners();
        
        // Скрыть загрузку, показать контент
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        
        // Применение темы Telegram
        applyTelegramTheme();
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showError('Ошибка загрузки приложения');
    }
}

// Аутентификация пользователя
async function authenticateUser() {
    const initData = tg.initDataUnsafe;
    
    if (!initData || !initData.user) {
        throw new Error('Не удалось получить данные пользователя Telegram');
    }
    
    const user = initData.user;
    
    try {
        const response = await fetch(`${API_URL}/auth/telegram`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegram_id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Ошибка авторизации');
        }
        
        authToken = data.token;
        currentUser = data.user;
        
        console.log('Пользователь авторизован:', currentUser);
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        throw error;
    }
}

// Загрузка баланса пользователя
async function loadUserBalance() {
    try {
        const response = await apiRequest('/users/balance');
        state.balance = response.points;
        updateBalanceDisplay();
    } catch (error) {
        console.error('Ошибка загрузки баланса:', error);
    }
}

// Загрузка статистики пользователя
async function loadUserStatistics() {
    try {
        const response = await apiRequest('/users/statistics');
        state.statistics = response.statistics;
        updateStatisticsDisplay();
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Загрузка списка наград
async function loadRewards(category = null) {
    try {
        const url = category && category !== 'all' 
            ? `/rewards?category=${category}` 
            : '/rewards';
        const response = await apiRequest(url);
        state.rewards = response.rewards;
        renderRewards();
    } catch (error) {
        console.error('Ошибка загрузки наград:', error);
    }
}

// Загрузка истории транзакций
async function loadTransactions() {
    try {
        const response = await apiRequest('/users/transactions');
        state.transactions = response.transactions;
        renderTransactions();
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
    }
}

// Обновление отображения баланса
function updateBalanceDisplay() {
    const balanceElement = document.getElementById('balance-amount');
    if (balanceElement) {
        balanceElement.textContent = state.balance;
    }
}

// Обновление отображения статистики
function updateStatisticsDisplay() {
    const statsElement = document.getElementById('user-stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${state.statistics.total_purchases || 0}</div>
                <div class="stat-label">Покупок</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${state.statistics.total_devices || 0}</div>
                <div class="stat-label">Устройств сдано</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${state.statistics.total_rewards || 0}</div>
                <div class="stat-label">Наград получено</div>
            </div>
        `;
    }
}

// Генерация QR-кода пользователя
function generateUserQRCode() {
    if (!currentUser) return;
    
    const canvas = document.getElementById('user-qr-code');
    if (canvas) {
        QRCode.toCanvas(canvas, `USER_${currentUser.telegram_id}`, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
    }
}

// Отрисовка списка наград
function renderRewards() {
    const rewardsList = document.getElementById('rewards-list');
    if (!rewardsList) return;
    
    if (state.rewards.length === 0) {
        rewardsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎁</div>
                <div class="empty-state-text">Награды скоро появятся</div>
            </div>
        `;
        return;
    }
    
    rewardsList.innerHTML = state.rewards.map(reward => `
        <div class="reward-card" data-reward-id="${reward.id}">
            <div class="reward-image">
                ${getCategoryEmoji(reward.category)}
            </div>
            <div class="reward-info">
                <div class="reward-title">${reward.title}</div>
                <div class="reward-cost">${reward.points_cost} баллов</div>
                ${reward.stock_quantity !== null ? 
                    `<div class="reward-stock">Осталось: ${reward.stock_quantity}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    // Добавление обработчиков кликов
    document.querySelectorAll('.reward-card').forEach(card => {
        card.addEventListener('click', () => {
            const rewardId = card.dataset.rewardId;
            showRewardDetail(rewardId);
        });
    });
}

// Отрисовка истории транзакций
function renderTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    if (!transactionsList) return;
    
    if (state.transactions.length === 0) {
        transactionsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <div class="empty-state-text">История операций пуста</div>
            </div>
        `;
        return;
    }
    
    transactionsList.innerHTML = state.transactions.map(transaction => `
        <div class="transaction-item">
            <div class="transaction-icon">
                ${getTransactionIcon(transaction.type)}
            </div>
            <div class="transaction-details">
                <div class="transaction-title">${transaction.description}</div>
                <div class="transaction-date">${formatDate(transaction.created_at)}</div>
                ${transaction.store_name ? `<div class="transaction-date">${transaction.store_name}</div>` : ''}
            </div>
            <div class="transaction-points ${transaction.points > 0 ? 'positive' : 'negative'}">
                ${transaction.points > 0 ? '+' : ''}${transaction.points}
            </div>
        </div>
    `).join('');
}

// Показ детальной информации о награде
async function showRewardDetail(rewardId) {
    const reward = state.rewards.find(r => r.id == rewardId);
    if (!reward) return;
    
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div class="reward-detail-image">
            ${getCategoryEmoji(reward.category)}
        </div>
        <div class="reward-detail-info">
            <div class="reward-detail-title">${reward.title}</div>
            <div class="reward-detail-description">${reward.description || 'Обменяйте баллы на эту награду'}</div>
            <div class="reward-detail-cost">${reward.points_cost} баллов</div>
            ${reward.stock_quantity !== null ? 
                `<div class="reward-stock">Осталось: ${reward.stock_quantity} шт.</div>` : ''}
        </div>
        <button class="btn-redeem" id="btn-redeem-reward" 
                ${state.balance < reward.points_cost ? 'disabled' : ''}>
            ${state.balance < reward.points_cost 
                ? `Недостаточно баллов (нужно еще ${reward.points_cost - state.balance})` 
                : 'Обменять баллы'}
        </button>
    `;
    
    document.getElementById('btn-redeem-reward').addEventListener('click', () => {
        redeemReward(rewardId);
    });
    
    showModal();
}

// Обмен баллов на награду
async function redeemReward(rewardId) {
    try {
        tg.showConfirm('Обменять баллы на эту награду?', async (confirmed) => {
            if (!confirmed) return;
            
            const response = await apiRequest(`/rewards/${rewardId}/redeem`, 'POST');
            
            if (response.success) {
                tg.showAlert('🎉 Награда получена! Покажите QR-код кассиру для получения награды.', () => {
                    hideModal();
                    loadUserBalance();
                    showMyRewards();
                });
            }
        });
    } catch (error) {
        console.error('Ошибка обмена награды:', error);
        tg.showAlert('❌ ' + (error.message || 'Ошибка при обмене награды'));
    }
}

// Показ моих наград
async function showMyRewards() {
    try {
        const response = await apiRequest('/rewards/redemptions/my');
        const redemptions = response.redemptions;
        
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <div class="modal-header">Мои награды</div>
            ${redemptions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-icon">🎁</div>
                    <div class="empty-state-text">У вас пока нет наград</div>
                </div>
            ` : redemptions.map(redemption => `
                <div class="transaction-item" style="margin-bottom: 16px;">
                    <div class="transaction-icon">🎁</div>
                    <div class="transaction-details">
                        <div class="transaction-title">${redemption.reward_title}</div>
                        <div class="transaction-date">${formatDate(redemption.created_at)}</div>
                        <div class="transaction-date">
                            Статус: ${getRedemptionStatus(redemption.status)}
                        </div>
                    </div>
                </div>
                ${redemption.status === 'pending' && redemption.qr_code_image ? `
                    <div class="balance-qr" style="margin-bottom: 20px;">
                        <img src="${redemption.qr_code_image}" alt="QR Code" style="max-width: 200px; border-radius: 12px;">
                        <p class="qr-hint">Покажите этот QR-код кассиру</p>
                    </div>
                ` : ''}
            `).join('')}
        `;
        
        showModal();
    } catch (error) {
        console.error('Ошибка загрузки наград:', error);
        tg.showAlert('Ошибка загрузки наград');
    }
}

// Показ списка магазинов
async function showStores() {
    try {
        const response = await apiRequest('/stores');
        const stores = response.stores;
        
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <div class="modal-header">Наши магазины</div>
            ${stores.map(store => `
                <div class="transaction-item" style="margin-bottom: 16px;">
                    <div class="transaction-icon">📍</div>
                    <div class="transaction-details">
                        <div class="transaction-title">${store.name}</div>
                        <div class="transaction-date">${store.city}</div>
                        <div class="transaction-date">${store.address}</div>
                        ${store.phone ? `<div class="transaction-date">📞 ${store.phone}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        `;
        
        showModal();
    } catch (error) {
        console.error('Ошибка загрузки магазинов:', error);
        tg.showAlert('Ошибка загрузки списка магазинов');
    }
}

// Обновление профиля
function showEditProfile() {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div class="modal-header">Редактировать профиль</div>
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Телефон</label>
            <input type="tel" id="input-phone" value="${currentUser.phone || ''}" 
                   placeholder="+7 (999) 123-45-67"
                   style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px;">
        </div>
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Email</label>
            <input type="email" id="input-email" value="${currentUser.email || ''}" 
                   placeholder="email@example.com"
                   style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px;">
        </div>
        <button class="btn-redeem" id="btn-save-profile">Сохранить</button>
    `;
    
    document.getElementById('btn-save-profile').addEventListener('click', async () => {
        const phone = document.getElementById('input-phone').value;
        const email = document.getElementById('input-email').value;
        
        try {
            await apiRequest('/auth/update-profile', 'POST', {
                telegram_id: currentUser.telegram_id,
                phone,
                email
            });
            
            currentUser.phone = phone;
            currentUser.email = email;
            
            tg.showAlert('✅ Профиль обновлен', () => {
                hideModal();
                renderProfile();
            });
        } catch (error) {
            tg.showAlert('❌ Ошибка сохранения профиля');
        }
    });
    
    showModal();
}

// Отрисовка профиля
function renderProfile() {
    const profileInfo = document.getElementById('profile-info');
    if (!profileInfo || !currentUser) return;
    
    const initials = (currentUser.first_name[0] + (currentUser.last_name ? currentUser.last_name[0] : '')).toUpperCase();
    document.getElementById('avatar-initials').textContent = initials;
    
    profileInfo.innerHTML = `
        <div class="profile-name">${currentUser.first_name} ${currentUser.last_name || ''}</div>
        ${currentUser.username ? `<div class="profile-detail">@${currentUser.username}</div>` : ''}
        ${currentUser.phone ? `<div class="profile-detail">📞 ${currentUser.phone}</div>` : ''}
        ${currentUser.email ? `<div class="profile-detail">📧 ${currentUser.email}</div>` : ''}
        <div class="profile-detail">ID: ${currentUser.telegram_id}</div>
    `;
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });
    
    // Фильтры наград
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const category = tab.dataset.category;
            loadRewards(category === 'all' ? null : category);
        });
    });
    
    // Кнопки профиля
    document.getElementById('btn-edit-profile').addEventListener('click', showEditProfile);
    document.getElementById('btn-my-rewards').addEventListener('click', showMyRewards);
    document.getElementById('btn-stores').addEventListener('click', showStores);
    
    // Закрытие модального окна
    document.querySelector('.modal-close').addEventListener('click', hideModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            hideModal();
        }
    });
    
    // Отрисовка профиля
    renderProfile();
}

// Переключение страниц
function switchPage(page) {
    state.currentPage = page;
    
    // Обновление навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // Обновление страниц
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`page-${page}`).classList.add('active');
    
    // Загрузка данных для страницы
    if (page === 'history' && state.transactions.length === 0) {
        loadTransactions();
    }
}

// Модальное окно
function showModal() {
    document.getElementById('modal').classList.add('active');
}

function hideModal() {
    document.getElementById('modal').classList.remove('active');
}

// Вспомогательные функции
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (!data.success && data.error) {
        throw new Error(data.error);
    }
    
    return data;
}

function getCategoryEmoji(category) {
    const emojis = {
        discount: '💸',
        gift: '🎁',
        merchandise: '👕'
    };
    return emojis[category] || '🎁';
}

function getTransactionIcon(type) {
    const icons = {
        purchase: '🛒',
        device_return: '♻️',
        reward_exchange: '🎁'
    };
    return icons[type] || '📊';
}

function getRedemptionStatus(status) {
    const statuses = {
        pending: '⏳ Ожидает получения',
        completed: '✅ Получено',
        cancelled: '❌ Отменено'
    };
    return statuses[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Сегодня, ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Вчера, ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}

function applyTelegramTheme() {
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
    document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#999999');
    document.documentElement.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color || '#2481cc');
    document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#2481cc');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');
}

function showError(message) {
    document.getElementById('loading').innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div>${message}</div>
        </div>
    `;
}

// Запуск приложения
init();
