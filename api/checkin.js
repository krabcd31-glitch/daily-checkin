import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CHECKIN_KEY = 'checkin:dates';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = new Date();
    const today = now.toLocaleDateString('zh-CN', { 
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');
    
    let checkins = await redis.get(CHECKIN_KEY) || [];
    if (typeof checkins === 'string') checkins = JSON.parse(checkins);
    
    const checkedToday = checkins.includes(today);
    
    let streak = 0;
    const checkDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    while (true) {
      const dateStr = checkDate.toLocaleDateString('zh-CN', { 
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
      }).replace(/\//g, '-');
      if (checkins.includes(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
    
    const recent7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      d.setDate(d.getDate() - i);
      recent7Days.push(d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'));
    }
    
    const sortedCheckins = [...checkins].sort().reverse();
    return res.status(200).json({
      checkedToday, streak,
      checkins: checkins.filter(d => recent7Days.includes(d)),
      lastCheckin: sortedCheckins[0] || null, today
    });
  } catch (error) {
    console.error('获取状态错误:', error);
    return res.status(500).json({ error: '服务器错误', checkedToday: false, streak: 0, checkins: [] });
  }
}
