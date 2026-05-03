const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TG_ID = "test_user_123"; 
const API_URL = '/api'; 

// Состояние игры
let playerExp = 0;
let playerTon = 0.0;
let playerDamage = 1;
let playerFireRate = 500;

// Объекты
const butler = { x: 50, y: 130, width: 40, height: 60, speed: 1.5, direction: 1 };
let monsters = [];
let bullets = [];
let lastShot = 0;

// --- ЛОГИКА API И ИНТЕРФЕЙСА ---

async function fetchUserData() {
    const res = await fetch(`${API_URL}/user/${TG_ID}`);
    const data = await res.json();
    playerExp = data.exp;
    playerTon = parseFloat(data.ton_balance).toFixed(2);
    playerDamage = data.damage;
    playerFireRate = data.fireRate;
    updateUI();
}

function updateUI() {
    document.getElementById('exp-display').innerText = playerExp;
    document.getElementById('ton-display').innerText = playerTon;
    document.getElementById('damage-display').innerText = playerDamage;
    document.getElementById('rate-display').innerText = playerFireRate;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
    
    if(tabName === 'market') loadMarket();
}

// --- ПРОКАЧКА ---
async function upgradeStat(stat) {
    const cost = stat === 'damage' ? 100 : 150;
    if (playerExp < cost) return alert('Мало EXP!');
    
    await fetch(`${API_URL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, stat: stat, cost: cost })
    });
    fetchUserData();
}

// --- P2P РЫНОК ---
async function loadMarket() {
    const res = await fetch(`${API_URL}/market`);
    const listings = await res.json();
    const container = document.getElementById('market-listings');
    container.innerHTML = '';
    
    if (listings.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: #bdc3c7;">Лотов нет</p>';
        return;
    }

    listings.forEach(listing => {
        const isOwn = listing.seller_id === TG_ID;
        const div = document.createElement('div');
        div.className = 'market-item';
        div.innerHTML = `
            <div>✨ ${listing.exp_amount} EXP -> 💎 ${listing.ton_price} TON<br><small>Продавец: ${listing.seller_id}</small></div>
            ${isOwn ? '<small>Ваш лот</small>' : `<button class="buy-btn" onclick="buyListing(${listing.id})">Купить</button>`}
        `;
        container.appendChild(div);
    });
}

function openListingModal() { document.getElementById('listing-modal').style.display = 'flex'; }
function closeListingModal() { document.getElementById('listing-modal').style.display = 'none'; }

async function createListing() {
    const expAmount = parseInt(document.getElementById('list-exp-amount').value);
    const tonPrice = parseFloat(document.getElementById('list-ton-price').value);
    if (!expAmount || !tonPrice || expAmount <= 0 || tonPrice <= 0) return alert('Введите корректные данные');

    await fetch(`${API_URL}/market/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, expAmount, tonPrice })
    });
    closeListingModal();
    fetchUserData();
    loadMarket();
}

async function buyListing(listingId) {
    await fetch(`${API_URL}/market/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: TG_ID, listingId })
    });
    fetchUserData();
    loadMarket();
}

async function withdrawTon() {
    const wallet = prompt('Введите ваш TON кошелек для вывода (UQ...):');
    if (!wallet) return;
    const amount = prompt('Сколько TON вывести?', playerTon);
    if (parseFloat(amount) > parseFloat(playerTon)) return alert('Недостаточно средств!');
    
    await fetch(`${API_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, amount: parseFloat(amount), wallet: wallet })
    });
    alert('Заявка создана!');
    fetchUserData();
}

// --- ИГРОВОЙ ЦИКЛ И РИСОВАНИЕ ---

function spawnMonster() {
    monsters.push({ x: 360, y: 140 - Math.random() * 40, width: 30, height: 40, speed: 1 + Math.random(), hp: 1 + Math.floor(Math.random() * playerDamage) });
}

// Рисовка Красивого Батлера (Пиксель-арт стиль)
function drawButler() {
    const bx = butler.x, by = butler.y;
    ctx.fillStyle = '#f39c12'; // Шляпа
    ctx.fillRect(bx + 10, by, 20, 10);
    ctx.fillRect(bx + 5, by + 10, 30, 5);

    ctx.fillStyle = '#ffeaa7'; // Лицо
    ctx.fillRect(bx + 12, by + 15, 16, 15);

    ctx.fillStyle = '#2d3436'; // Глаза
    ctx.fillRect(bx + 15, by + 20, 4, 4);
    ctx.fillRect(bx + 22, by + 20, 4, 4);

    ctx.fillStyle = '#636e72'; // Пиджак
    ctx.fillRect(bx + 8, by + 30, 24, 20);
    ctx.fillStyle = '#dfe6e9'; // Рубашка
    ctx.fillRect(bx + 18, by + 30, 4, 20);

    ctx.fillStyle = '#2d3436'; // Штаны
    ctx.fillRect(bx + 10, by + 50, 8, 10);
    ctx.fillRect(bx + 22, by + 50, 8, 10);
}

// Рисовка Монстра
function drawMonster(m) {
    ctx.fillStyle = '#d63031'; // Тело
    ctx.fillRect(m.x, m.y, m.width, m.height);
    ctx.fillStyle = '#fdcb6e'; // Глаза
    ctx.fillRect(m.x + 5, m.y + 10, 6, 6);
    ctx.fillRect(m.x + 18, m.y + 10, 6, 6);
    ctx.fillStyle = '#e17055'; // Рот
    ctx.fillRect(m.x + 8, m.y + 25, 14, 5);
}

function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Движение Батлера
    butler.x += butler.speed * butler.direction;
    if (butler.x > 150 || butler.x < 20) butler.direction *= -1;

    drawButler();

    // Стрельба (зависит от playerFireRate)
    if (timestamp - lastShot > playerFireRate) {
        bullets.push({ x: butler.x + butler.width, y: butler.y + 35, width: 8, height: 3, speed: 6 });
        lastShot = timestamp;
    }

    // Пули
    ctx.fillStyle = '#fdcb6e';
    bullets = bullets.filter(b => b.x < 380);
    bullets.forEach(b => { b.x += b.speed; ctx.fillRect(b.x, b.y, b.width, b.height); });

    // Монстры
    monsters.forEach(m => { m.x -= m.speed; drawMonster(m); });

    // Коллизии
    for (let i = monsters.length - 1; i >= 0; i--) {
        for (let j = bullets.length - 1; j >= 0; j--) {
            if (bullets[j].x < monsters[i].x + monsters[i].width &&
                bullets[j].x + bullets[j].width > monsters[i].x &&
                bullets[j].y < monsters[i].y + monsters[i].height &&
                bullets[j].y + bullets[j].height > monsters[i].y) {
                
                monsters[i].hp -= playerDamage;
                bullets.splice(j, 1);
                
                if(monsters[i].hp <= 0) {
                    const expGain = 10;
                    monsters.splice(i, 1);
                    playerExp += expGain;
                    updateUI();
                    
                    // Отправляем на сервер (с лимитом запросов, чтобы не спамить)
                    fetch(`${API_URL}/add-exp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tgId: TG_ID, amount: expGain })
                    });
                }
                break;
            }
        }
    }
    monsters = monsters.filter(m => m.x > -40);
    requestAnimationFrame(gameLoop);
}

// Спавн монстров
setInterval(spawnMonster, 2000);

// Запуск
fetchUserData();
requestAnimationFrame(gameLoop);
