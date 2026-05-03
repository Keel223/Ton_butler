const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const app = express();
app.use(cors());
app.use(express.json());

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_TG_ID = "6188749367";
const TREASURY_WALLET = "UQD1gupv0Z0UPnKKYENmerBA526cCiNvhdr4VO0LofATa8v6";

// --- API ИГРОКА ---
app.get('/api/user/:tgId', async (req, res) => {
  const { tgId } = req.params;
  try {
    const [exp, ton, damage, fireRate] = await redis.mget(
      `user:${tgId}:exp`, `user:${tgId}:ton`, 
      `user:${tgId}:damage`, `user:${tgId}:fireRate`
    );
    res.json({
      tg_id: tgId,
      exp: Number(exp) || 0,
      ton_balance: parseFloat(ton) || 0.00,
      damage: Number(damage) || 1,
      fireRate: Number(fireRate) || 500 // 500 мс по умолчанию
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/add-exp', async (req, res) => {
  const { tgId, amount } = req.body;
  try {
    await redis.incrby(`user:${tgId}:exp`, amount);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ПРОКАЧКА ---
app.post('/api/upgrade', async (req, res) => {
  const { tgId, stat, cost } = req.body;
  try {
    const currentExp = Number(await redis.get(`user:${tgId}:exp`)) || 0;
    if (currentExp < cost) return res.status(400).json({ error: 'Not enough EXP' });

    await redis.decrby(`user:${tgId}:exp`, cost);
    if (stat === 'damage') {
      await redis.incrby(`user:${tgId}:damage`, 1);
    } else if (stat === 'fireRate') {
      await redis.incrbyfloat(`user:${tgId}:fireRate`, -50); // Быстрее на 50мс
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- P2P РЫНОК ---
app.get('/api/market', async (req, res) => {
  try {
    const marketRaw = await redis.get('market_listings');
    const listings = marketRaw ? JSON.parse(marketRaw) : [];
    res.json(listings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/market/list', async (req, res) => {
  const { tgId, expAmount, tonPrice } = req.body;
  try {
    const currentExp = Number(await redis.get(`user:${tgId}:exp`)) || 0;
    if (currentExp < expAmount) return res.status(400).json({ error: 'Not enough EXP' });

    // Замораживаем EXP (списываем с баланса)
    await redis.decrby(`user:${tgId}:exp`, expAmount);

    const marketRaw = await redis.get('market_listings');
    const listings = marketRaw ? JSON.parse(marketRaw) : [];
    
    listings.push({
      id: Date.now(),
      seller_id: tgId,
      exp_amount: expAmount,
      ton_price: tonPrice
    });

    await redis.set('market_listings', JSON.stringify(listings));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/market/buy', async (req, res) => {
  const { buyerId, listingId } = req.body;
  try {
    const marketRaw = await redis.get('market_listings');
    let listings = marketRaw ? JSON.parse(marketRaw) : [];
    
    const index = listings.findIndex(l => l.id === listingId);
    if (index === -1) return res.status(404).json({ error: 'Listing not found' });
    
    const listing = listings[index];
    if (listing.seller_id === buyerId) return res.status(400).json({ error: 'Cannot buy your own listing' });

    const buyerTon = parseFloat(await redis.get(`user:${buyerId}:ton`)) || 0;
    if (buyerTon < listing.ton_price) return res.status(400).json({ error: 'Not enough TON' });

    // Списываем TON у покупателя
    await redis.incrbyfloat(`user:${buyerId}:ton`, -listing.ton_price);
    // Даем EXP покупателю
    await redis.incrby(`user:${buyerId}:exp`, listing.exp_amount);
    // Даем TON продавцу
    await redis.incrbyfloat(`user:${listing.seller_id}:ton`, listing.ton_price);

    // Удаляем лот с рынка
    listings.splice(index, 1);
    await redis.set('market_listings', JSON.stringify(listings));
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ВЫВОД (из предыдущего шага) ---
app.post('/api/withdraw', async (req, res) => {
  const { tgId, amount, wallet } = req.body;
  try {
    const currentTon = parseFloat(await redis.get(`user:${tgId}:ton`)) || 0;
    if (currentTon < amount) return res.status(400).json({ error: 'Not enough TON' });
    await redis.incrbyfloat(`user:${tgId}:ton`, -amount);
    const withdrawalsRaw = await redis.get('withdrawals');
    const withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];
    withdrawals.push({ id: Date.now(), tg_id: tgId, amount: amount, wallet: wallet, status: 'pending' });
    await redis.set('withdrawals', JSON.stringify(withdrawals));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- АДМИНКА ---
app.get('/api/admin/withdrawals', async (req, res) => {
  const tgId = req.headers['x-admin-id'];
  if (tgId !== ADMIN_TG_ID) return res.status(403).json({ error: 'Access denied' });
  try {
    const withdrawalsRaw = await redis.get('withdrawals');
    const withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];
    res.json(withdrawals.filter(w => w.status === 'pending'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/approve-withdrawal', async (req, res) => {
  const tgId = req.headers['x-admin-id'];
  if (tgId !== ADMIN_TG_ID) return res.status(403).json({ error: 'Access denied' });
  const { id } = req.body;
  try {
    const withdrawalsRaw = await redis.get('withdrawals');
    let withdrawals = withdrawalsRaw ? JSON.parse(withdrawalsRaw) : [];
    const index = withdrawals.findIndex(w => w.id === id);
    if (index !== -1) {
      withdrawals[index].status = 'completed';
      await redis.set('withdrawals', JSON.stringify(withdrawals));
      res.json({ success: true });
    } else { res.status(404).json({ error: 'Not found' }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = app;
