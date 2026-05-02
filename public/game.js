const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TG_ID = "test_user_123"; // Позже замени на window.Telegram.WebApp.initDataUnsafe.user.id
const API_URL = '/api'; 
const TREASURY_WALLET = "UQD1gupv0Z0UPnKKYENmerBA526cCiNvhdr4VO0LofATa8v6"; // Твой кошелек для приема TON

let playerExp = 0;
let playerTon = 0.0;

const butler = { x: 50, y: 150, width: 20, height: 30, color: 'white', speed: 2, direction: 1 };
let monsters = [];
let bullets = [];
let lastShot = 0;

async function fetchUserData() {
    const res = await fetch(`${API_URL}/user/${TG_ID}`);
    const data = await res.json();
    playerExp = data.exp;
    playerTon = parseFloat(data.ton_balance).toFixed(2);
    updateUI();
}

function updateUI() {
    document.getElementById('exp-display').innerText = playerExp;
    document.getElementById('ton-display').innerText = playerTon;
}

function spawnMonster() {
    monsters.push({
        x: 350, y: 160 - Math.random() * 20,
        width: 20, height: 20, color: 'red',
        speed: 1 + Math.random()
    });
}

function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    butler.x += butler.speed * butler.direction;
    if (butler.x > 150 || butler.x < 20) butler.direction *= -1;

    ctx.fillStyle = butler.color;
    ctx.fillRect(butler.x, butler.y, butler.width, butler.height);

    if (timestamp - lastShot > 500) {
        bullets.push({ x: butler.x + butler.width, y: butler.y + 10, width: 5, height: 3, speed: 5 });
        lastShot = timestamp;
    }

    bullets = bullets.filter(b => b.x < 350);
    bullets.forEach(b => {
        b.x += b.speed;
        ctx.fillStyle = 'yellow';
        ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    monsters.forEach(m => {
        m.x -= m.speed;
        ctx.fillStyle = m.color;
        ctx.fillRect(m.x, m.y, m.width, m.height);
    });

    for (let i = monsters.length - 1; i >= 0; i--) {
        for (let j = bullets.length - 1; j >= 0; j--) {
            if (bullets[j].x < monsters[i].x + monsters[i].width &&
                bullets[j].x + bullets[j].width > monsters[i].x &&
                bullets[j].y < monsters[i].y + monsters[i].height &&
                bullets[j].y + bullets[j].height > monsters[i].y) {
                
                monsters.splice(i, 1);
                bullets.splice(j, 1);
                
                playerExp += 10;
                updateUI();
                fetch(`${API_URL}/add-exp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tgId: TG_ID, amount: 10 })
                });
                break;
            }
        }
    }

    monsters = monsters.filter(m => m.x > -20);
    requestAnimationFrame(gameLoop);
}

setInterval(spawnMonster, 2000);

document.getElementById('sell-exp-btn').onclick = async () => {
    if (playerExp < 100) return alert('Мало EXP!');
    await fetch(`${API_URL}/sell-exp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, expAmount: 100, tonRate: 0.001 })
    });
    fetchUserData();
};

document.getElementById('withdraw-btn').onclick = async () => {
    const wallet = prompt('Введите ваш TON кошелек для вывода (UQ...):');
    if (!wallet) return;
    const amount = prompt('Сколько TON вывести?', playerTon);
    if (parseFloat(amount) > parseFloat(playerTon)) return alert('Недостаточно средств!');
    
    await fetch(`${API_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: TG_ID, amount: parseFloat(amount), wallet: wallet })
    });
    alert('Заявка создана! Ожидайте выплаты от админа.');
    fetchUserData();
};

fetchUserData();
requestAnimationFrame(gameLoop);
