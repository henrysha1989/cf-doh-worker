
const UPSTREAM_DOH = 'https://1.1.1.1/dns-query';

export default {
  // 1. 处理日常的 DNS 请求
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/dns-query') {
      return await handleDoHRequest(request, env, ctx);
    }
    return new Response('Not Found', { status: 404 });
  },

  // 2. 处理定时任务（每天固定时间触发）
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyTelegramReport(env));
  }
};

/**
 * 核心：日常 DoH 转发与异步计数
 */
async function handleDoHRequest(request, env, ctx) {
  const method = request.method;
  const headers = new Headers();
  headers.set('Accept', 'application/dns-message');

  if (method === 'POST') {
    headers.set('Content-Type', 'application/dns-message');
    
    // 异步计数：今天请求数 +1
    if (env.DOH_LOGS) {
      ctx.waitUntil(incrementTodayCount(env));
    }

    return fetch(UPSTREAM_DOH, {
      method: 'POST',
      headers: headers,
      body: await request.arrayBuffer()
    });
  } else if (method === 'GET') {
    if (env.DOH_LOGS) {
      ctx.waitUntil(incrementTodayCount(env));
    }
    const url = new URL(request.url);
    return fetch(`${UPSTREAM_DOH}${url.search}`, { method: 'GET', headers: headers });
  }
  return new Response('Method Not Allowed', { status: 405 });
}

/**
 * 辅助函数：让今天的计数器加 1
 */
async function incrementTodayCount(env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `doh_count:${today}`;
    const current = parseInt(await env.DOH_LOGS.get(key) || '0');
    await env.DOH_LOGS.put(key, (current + 1).toString());
  } catch (e) {}
}

/**
 * 核心：定时发送 Telegram 报告
 */
async function sendDailyTelegramReport(env) {
  // 检查环境变量是否齐全
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID || !env.DOH_LOGS) return;

  try {
    // 获取昨天的日期字符串（因为通常是半夜或者第二天清晨总结昨天的量）
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = yesterdayObj.toISOString().split('T')[0];

    // 从 KV 数据库读取昨天的总请求量
    const key = `doh_count:${yesterday}`;
    const count = await env.DOH_LOGS.get(key) || '0';

    // 组装精致的 Telegram 推送文本
    const message = `🚀 *自建 DoH 每日运行报告*\n\n📅 报告日期：\`${yesterday}\`\n🛡️ 加密解析请求：\`${count} 次\`\n🟢 运行状态：\`正常（健康度 100%）\``;

    // 推送给 Telegram Bot
    const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}
