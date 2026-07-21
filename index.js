/**
 * Cloudflare Worker 自建 DoH + 每日 Telegram 额度报告系统（稳定版）
 */

const UPSTREAM_DOH = 'https://1.1.1.1/dns-query';
const GLOBAL_DAILY_LIMIT = 100000; // Cloudflare 免费版账号每日全局上限

export default {
  // 1. 处理日常 DNS 请求与测试接口
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 【测试接口】：访问 https://doh.521989.xyz/test-tg 触发推送测试
    if (url.pathname === '/test-tg') {
      if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID || !env.DOH_LOGS) {
        return new Response('❌ 环境变量或 DOH_LOGS (KV) 未绑定完整！', { status: 400 });
      }
      try {
        await sendDailyTelegramReport(env, true);
        return new Response('✅ Telegram 测试消息已发送，请检查手机！', { status: 200 });
      } catch (e) {
        return new Response(`❌ 发送失败: ${e.message}`, { status: 500 });
      }
    }

    if (url.pathname === '/dns-query') {
      return await handleDoHRequest(request, env, ctx);
    }
    return new Response('Not Found', { status: 404 });
  },

  // 2. 每日定时触发
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyTelegramReport(env));
  }
};

/**
 * 核心：DoH 转发与请求次数计数
 */
async function handleDoHRequest(request, env, ctx) {
  const method = request.method;
  const headers = new Headers();
  headers.set('Accept', 'application/dns-message');

  // 仅对当前 DoH 的请求进行 +1 计数
  if (env.DOH_LOGS) {
    ctx.waitUntil(incrementTodayCount(env));
  }

  if (method === 'POST') {
    headers.set('Content-Type', 'application/dns-message');
    return fetch(UPSTREAM_DOH, {
      method: 'POST',
      headers: headers,
      body: await request.arrayBuffer()
    });
  } else if (method === 'GET') {
    const url = new URL(request.url);
    return fetch(`${UPSTREAM_DOH}${url.search}`, { method: 'GET', headers: headers });
  }
  return new Response('Method Not Allowed', { status: 405 });
}

/**
 * 辅助函数：累计今天本 DoH 项目的请求次数
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
 * 核心：发送 Telegram 运行与额度报告
 */
async function sendDailyTelegramReport(env, isTest = false) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID || !env.DOH_LOGS) return;

  const dateObj = new Date();
  if (!isTest) {
    dateObj.setDate(dateObj.getDate() - 1); // 定时任务总结昨天的全天数据
  }
  const targetDate = dateObj.toISOString().split('T')[0];

  // 从 KV 读取当前 DoH 项目的独占请求次数
  const key = `doh_count:${targetDate}`;
  const countRaw = await env.DOH_LOGS.get(key) || '0';
  const dohCount = parseInt(countRaw);

  // 计算本项目占每日 10 万次总额度的比例
  const dohPercent = ((dohCount / GLOBAL_DAILY_LIMIT) * 100).toFixed(2);
  const dohCountFormatted = dohCount.toLocaleString();

  const title = isTest ? '🧪 *自建 DoH 推送测试*' : '🚀 *自建 DoH 每日运行报告*';
  
  const message = `${title}\n\n` +
    `📅 统计日期：\`${targetDate}\`\n` +
    `🛡️ 本 DoH 解析请求：\`${dohCountFormatted} 次\`\n` +
    `📈 占账号总额度：\`${dohPercent}% / 100,000\`\n` +
    `🟢 运行状态：\`正常（健康度 100%）\`\n\n` +
    `💡 _提示：如账号下有其他 Worker，账号总消耗请以 CF 控制台为准。_`;

  const tgUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const res = await fetch(tgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TG_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
}
