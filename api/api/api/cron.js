import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CHECKIN_KEY = 'checkin:dates';
const ALERT_SENT_KEY = 'alert:sent';

async function sendAlertEmail(missedDays) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
  
  const familyEmail = process.env.FAMILY_EMAIL;
  const userName = process.env.USER_NAME || '您的家人';
  if (!familyEmail) return false;
  
  try {
    await transporter.sendMail({
      from: '"签到提醒系统" <' + process.env.EMAIL_USER + '>',
      to: familyEmail,
      subject: '⚠️ ' + userName + '已经' + missedDays + '天没有签到了',
      html: '<div style="font-family:Arial;max-width:600px;margin:0 auto;padding:20px"><div style="background:linear-gradient(135deg,#ff6b6b,#ee5a5a);color:white;padding:30px;border-radius:10px 10px 0 0;text-align:center"><h1 style="margin:0">⚠️ 签到提醒</h1></div><div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px"><p style="font-size:18px;color:#333">您好，</p><p style="font-size:16px;color:#555"><strong>' + userName + '</strong> 已经连续 <span style="color:#e74c3c;font-size:24px;font-weight:bold">' + missedDays + '</span> 天没有签到了。</p><p style="font-size:16px;color:#555">请关心一下 ta 的情况。</p></div></div>',
    });
    return true;
  } catch (error) {
    console.error('发送邮件失败:', error);
    return false;
  }
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    
    const yesterday = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    
    const dayBefore = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    dayBefore.setDate(dayBefore.getDate() - 2);
    const dayBeforeStr = dayBefore.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    
    let checkins = await redis.get(CHECKIN_KEY) || [];
    if (typeof checkins === 'string') checkins = JSON.parse(checkins);
    
    if (checkins.includes(today)) {
      await redis.del(ALERT_SENT_KEY);
      return res.status(200).json({ message: '今天已签到，无需警报' });
    }
    
    if (!checkins.includes(yesterdayStr) && !checkins.includes(dayBeforeStr)) {
      const alertSent = await redis.get(ALERT_SENT_KEY);
      if (alertSent === today) return res.status(200).json({ message: '今天已发送过警报' });
      
      let missedDays = 2;
      const checkDate = new Date(dayBefore);
      while (missedDays < 30) {
        checkDate.setDate(checkDate.getDate() - 1);
        const dateStr = checkDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
        if (checkins.includes(dateStr)) break;
        missedDays++;
      }
      
      const emailSent = await sendAlertEmail(missedDays);
      if (emailSent) await redis.set(ALERT_SENT_KEY, today);
      return res.status(200).json({ message: emailSent ? '警报邮件已发送' : '邮件发送失败', missedDays });
    }
    
    return res.status(200).json({ message: '签到状态正常' });
  } catch (error) {
    console.error('定时任务错误:', error);
    return res.status(500).json({ error: '服务器错误' });
  }
}
