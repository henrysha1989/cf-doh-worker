/**
 * Cloudflare Worker 自建 DoH (DNS over HTTPS) 转发脚本
 * 功能：将客户端的 DoH 请求安全转发给上游 Cloudflare 公共 DNS，并在传输中享受 TLS/ECH 保护。
 */

const UPSTREAM_DOH = 'https://1.1.1.1/dns-query';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 安全防御：仅允许符合 /dns-query 路径的请求通过
    if (url.pathname === '/dns-query') {
      return await handleDoHRequest(request);
    }

    // 非标准 DNS 请求（如浏览器直接访问根目录）统一返回 404 Not Found
    return new Response('Not Found', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

/**
 * 处理并转发标准的 DoH 请求
 */
async function handleDoHRequest(request) {
  const method = request.method;
  
  // 构造发往上游 1.1.1.1 的请求头部，保持标准的 DNS 报文格式
  const headers = new Headers();
  headers.set('Accept', 'application/dns-message');
  
  if (method === 'POST') {
    // 处理 POST 请求（通常由代理软件在后台发起）
    headers.set('Content-Type', 'application/dns-message');
    const body = await request.arrayBuffer();
    
    return fetch(UPSTREAM_DOH, {
      method: 'POST',
      headers: headers,
      body: body
    });
  } else if (method === 'GET') {
    // 处理 GET 请求（标准的 Base64Url 编码请求）
    const url = new URL(request.url);
    const targetUrl = `${UPSTREAM_DOH}${url.search}`;
    
    return fetch(targetUrl, {
      method: 'GET',
      headers: headers
    });
  } else {
    // 拒绝其他非标准请求方式（如浏览器直接请求明文传参会触发 405）
    return new Response('Method Not Allowed', { status: 405 });
  }
}
