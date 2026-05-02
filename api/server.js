const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к Upstash (ЭТО ДОЛЖНО БЫТЬ В ПЕРЕМЕННЫХ ОКРУЖЕНИЯ VERCEL!)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_TG_ID = "6188749367"; // Твой Telegram ID
const TREASURY_WALLET = "UQD1gupv0Z0UPnKKYENmerBA526cCiNvhdr4VO0LofATa8v6"; // Твой TON кошелек

// --- API ИГРОКА ---

app.get('/api/user/:tgId', async (req, res) => {
  const { tgId } = req.params;
  try {
    const [exp, ton] = await redis.mget(`user:${tgId}:exp`, `user:${tgId}:ton`);
    res.json({
      tg_id: tgId,
      exp: Number(exp) || 0,
      ton_balance: parseFloat(ton) || 0.00
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/add-exp', async (req, res) => {
  const { tgId, amount } = req.body;
  try {
    await redis.incrby(`user:${tgId}:exp`, amount);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sell-exp', async (req, res) => {
  const { tgId, expAmount, tonRate } = req.body;
  const tonAmount = expAmount * tonRate;
  try {
    const currentExp = Number(await redis.get(`user:${tgId}:exp`)) || 0;
    if (currentExp < expAmount) return res.status(400).json({ error: 'Not enough EXP' });

    await redis.decrby(`user:${tgId}:exp`, expAmount);
    await redis.incrbyfloat(`user:${tgId}:ton`, tonAmount);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/withdraw', async (req, res) => {
  const { tgId, amount, wallet } = req.body;
  try {
    const currentTon = parseFloat(await redis.get(`user:${tgId}:ton`)) || 0;
    if (currentTon < amount) return res.status(400).json({ error: 'Not enough TON' });

    await redis.incrbyfloat(`user:${tgId}:ton`, -amount);

    const withdrawalsRaw = await redis.get('withdrawals');
    const withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];
    
    withdrawals.push({
      id: Date.now(),
      tg_id: tgId,
      amount: amount,
      wallet: wallet,
      status: 'pending'
    });

    await redis.set('withdrawals', JSON.stringify(withdrawals));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- АДМИНКА (ДОСТУП ТОЛЬКО ПО ТВОЕМУ TG ID) ---

app.get('/api/admin/withdrawals', async (req, res) => {
  const tgId = req.headers['x-admin-id']; // Берем ID из заголовка
  if (tgId !== ADMIN_TG_ID) return res.status(403).json({ error: 'Access denied' });

  try {
    const withdrawalsRaw = await redis.get('withdrawals');
    const withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];
    res.json(withdrawals.filter(w => w.status === 'pending'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/approve-withdrawal', async (req, res) => {
  const tgId = req.headers['x-admin-id']; // Берем ID из заголовка
  if (tgId !== ADMIN_TG_ID) return res.status(403).json({ error: 'Access denied' });

  const { id } = req.body;
  try {
    const withdrawalsRaw = await redis.get('withdrawals');
    const withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];

    const index = withdrawals.findIndex(w => w.id === id);
    if (index !== -1) {
      withdrawals[index].status = 'completed';
      await redis.set('withdrawals', JSON.stringify(withdrawals));
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Withdrawal not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
