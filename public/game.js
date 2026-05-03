const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TG_ID = "test_user_123"; // Заменить на Telegram ID
const API_URL = '/api'; 
const TREASURY_WALLET = "UQD1gupv0Z0UPnKKYENmerBA526cCiNvhdr4VO0LofATa8v6"; // Твой кошелек

// --- TON CONNECT ---
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://raw.githubusercontent.com/CryptoBute/ton-connect-manifest/main/tonconnect-manifest.json', // Временный манифест для теста
    buttonRootId: 'ton-connect-container'
});

tonConnectUI.onStatusChange(async (walletInfo) => {
    if (walletInfo) {
        console.log("Кошелек подключен: ", walletInfo.account.address);
    }
});

async function depositTon() {
    if (!tonConnectUI.connected) {
        await tonConnectUI.connectWallet();
    }
    const amount = prompt("Сколько TON вы хотите внести?", "0.1");
    if (!amount || parseFloat(amount) <= 0) return;

    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 60,
        messages: [
            {
                address: TREASURY_WALLET,
                amount: String(Math.round(parseFloat(amount) * 1000000000)) // TON в нанотонах
            }
        ]
    };
    
    try {
        await tonConnectUI.sendTransaction(transaction);
        alert("Транзакция отправлена! Начисление произойдет после подтверждения сети.");
        // В реальном проекте тут нужно слушать вебхук от TON, а для старта можно начислять вручную в админке
    } catch (e) {
        console.error(e);
    }
}

// --- Состояние игры ---
let playerExp = 0;
let playerTon = 0.0;
let playerDamage = 1;
let playerFireRate = 500;
let animFrame = 0; // Для анимации ходьбы

const butler = { x: 150, y: 320, width: 50, height: 70, speed: 2, direction: 1 };
let monsters = [];
let bullets = [];
let lastShot = 0;

// --- API И ИНТЕРФЕЙС ---
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

async function upgradeStat(stat) {
    const cost = stat === 'damage' ? 100 : 150;
    if (playerExp < cost) return alert('Мало EXP!');
    await fetch(`${API_URL}/upgrade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, stat: stat, cost: cost })
    });
    fetchUserData();
}

async function loadMarket() {
    const res = await fetch(`${API_URL}/market`);
    const listings = await res.json();
    const container = document.getElementById('market-listings');
    container.innerHTML = '';
    if (listings.length === 0) { container.innerHTML = '<p style="text-align:center; color: #8395a7;">Лотов нет</p>'; return; }
    listings.forEach(listing => {
        const isOwn = listing.seller_id === TG_ID;
        const div = document.createElement('div');
        div.className = 'market-item';
        div.innerHTML = `<div>✨ ${listing.exp_amount} EXP -> 💎 ${listing.ton_price} TON<br><small>Продавец: ${listing.seller_id}</small></div>
        ${isOwn ? '<small>Ваш лот</small>' : `<button class="buy-btn" onclick="buyListing(${listing.id})">Купить</button>`}`;
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, expAmount, tonPrice })
    });
    closeListingModal(); fetchUserData(); loadMarket();
}

async function buyListing(listingId) {
    await fetch(`${API_URL}/market/buy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: TG_ID, listingId })
    });
    fetchUserData(); loadMarket();
}

async function withdrawTon() {
    const wallet = prompt('Введите ваш TON кошелек для вывода (UQ...):');
    if (!wallet) return;
    const amount = prompt('Сколько TON вывести?', playerTon);
    if (parseFloat(amount) > parseFloat(playerTon)) return alert('Недостаточно средств!');
    await fetch(`${API_URL}/withdraw`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, amount: parseFloat(amount), wallet: wallet })
    });
    alert('Заявка создана!'); fetchUserData();
}

// --- ИГРОВОЙ ЦИКЛ И РИСОВАНИЕ ---

function spawnMonster() {
    monsters.push({ 
        x: Math.random() * 300, 
        y: -40, 
        width: 40, 
        height: 40, 
        speed: 0.5 + Math.random() * 1, 
        hp: 1 + Math.floor(Math.random() * playerDamage),
        type: Math.random() > 0.5 ? 'slime' : 'bat' // Разные монстры
    });
}

// Красивый Батлер (Пиксель-арт детально)
function drawButler() {
    const bx = butler.x, by = butler.y;
    ctx.save();
    
    // Отражение персонажа в зависимости от направления
    if (butler.direction === -1) {
        ctx.translate(bx + butler.width, by);
        ctx.scale(-1, 1);
        bx = 0; by = 0;
    }

    // Плащ (развевается)
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(bx+5, by+20, 35, 35);
    ctx.fillRect(bx+0, by+25, 10, 25 + Math.sin(animFrame)*5);

    // Тело (Смокинг)
    ctx.fillStyle = '#111111';
    ctx.fillRect(bx+10, by+20, 25, 30);
    
    // Рубашка
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(bx+20, by+20, 5, 30);

    // Ноги (Анимация шага)
    ctx.fillStyle = '#111111';
    if (Math.sin(animFrame * 0.2) > 0) {
        ctx.fillRect(bx+12, by+50, 8, 15);
        ctx.fillRect(bx+25, by+50, 8, 10);
    } else {
        ctx.fillRect(bx+12, by+50, 8, 10);
        ctx.fillRect(bx+25, by+50, 8, 15);
    }
    // Ботинки
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(bx+10, by+60, 10, 5);
    ctx.fillRect(bx+25, by+60, 10, 5);

    // Голова
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(bx+12, by+5, 20, 15);

    // Цилиндр
    ctx.fillStyle = '#111111';
    ctx.fillRect(bx+8, by-5, 28, 8); // Поля шляпы
    ctx.fillRect(bx+14, by-20, 16, 18); // Тулья

    // Монокль
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx+27, by+10, 4, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx+27, by+14); ctx.lineTo(bx+27, by+20); ctx.stroke(); // Цепочка

    // Глаза
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx+16, by+9, 3, 3);
    ctx.fillRect(bx+23, by+9, 3, 3);

    // Пушка (Сверкает)
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(bx+30, by+15, 15, 5); // Ствол
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(bx+30, by+20, 10, 3); // Рукоять
    ctx.fillStyle = '#e74c3c'; // Огонь на конце
    if (Date.now() - lastShot < 100) {
        ctx.fillRect(bx+45, by+13, 5, 9);
    }

    ctx.restore();
}

function drawMonster(m) {
    if (m.type === 'slime') {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.ellipse(m.x + 20, m.y + 25, 20, 15 + Math.sin(animFrame)*5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillRect(m.x+10, m.y+15, 6, 6); // Глаза
        ctx.fillRect(m.x+24, m.y+15, 6, 6);
    } else {
        // Летучая мышь
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(m.x+15, m.y+15, 10, 10); // Тело
        // Крылья (машут)
        if (Math.sin(animFrame * 0.5) > 0) {
            ctx.fillRect(m.x, m.y+10, 15, 10);
            ctx.fillRect(m.x+25, m.y+10, 15, 10);
        } else {
            ctx.fillRect(m.x+5, m.y+5, 10, 10);
            ctx.fillRect(m.x+25, m.y+5, 10, 10);
        }
        ctx.fillStyle = 'yellow';
        ctx.fillRect(m.x+17, m.y+17, 3, 3);
        ctx.fillRect(m.x+22, m.y+17, 3, 3);
    }
}

function gameLoop(timestamp) {
    animFrame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Пол (земля)
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(0, 370, 350, 30);

    // Движение Батлера
    butler.x += butler.speed * butler.direction;
    if (butler.x > 280 || butler.x < 10) butler.direction *= -1;

    drawButler();

    // Стрельба ВВЕРХ (зависит от playerFireRate)
    if (timestamp - lastShot > playerFireRate) {
        bullets.push({ x: butler.x + 35, y: butler.y + 15, width: 4, height: 10, speed: 7 });
        lastShot = timestamp;
    }

    // Пули летят ВВЕРХ (y уменьшается)
    ctx.fillStyle = '#f1c40f';
    bullets = bullets.filter(b => b.y > -10);
    bullets.forEach(b => { b.y -= b.speed; ctx.fillRect(b.x, b.y, b.width, b.height); });

    // Монстры падают ВНИЗ (y увеличивается)
    monsters.forEach(m => { m.y += m.speed; drawMonster(m); });

    // Коллизии (Пуля летит вверх, монстр падает вниз)
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
                    
                    fetch(`${API_URL}/add-exp`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tgId: TG_ID, amount: expGain })
                    });
                }
                break;
            }
        }
    }
    
    // Удаляем монстров упавших на землю
    monsters = monsters.filter(m => m.y < 380);

    requestAnimationFrame(gameLoop);
}

// Спавн монстров сверху
setInterval(spawnMonster, 1500);

// Запуск
fetchUserData();
requestAnimationFrame(gameLoop);
