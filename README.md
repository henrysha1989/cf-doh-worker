# 🚀 Cloudflare Worker 自建专属 DoH 服务

本项目利用 Cloudflare Workers 免费额度，搭建了一个支持 **TLS + DoH + ECH** 全加密保护的专属 DNS 解析服务。主要用于配合代理软件（如 Shadowrocket ）进行海外域名防污染解析，同时隐藏个人上网的 SNI 特征。

## ✨ 特性
- **极速响应**：平均 CPU 执行时间仅 ~0.36ms，极其轻量。
- **完全隐私**：非 `/dns-query` 路径直接防御返回 404，不对外公开暴露。
- **无感白嫖**：配合国内常规 DNS 分流，个人每日 10 万次免费额度根本用不完。

## 🛠️ 部署步骤

### 第一步：创建 Cloudflare Worker
1. 登录 Cloudflare 控制台。
2. 进入 **Workers & Pages** -> 点击 **Create Application** -> **Create Worker**。
3. 修改 Worker 名称（例如 `my-doh-proxy`），点击 **Deploy**。
4. 点击 **Edit Code**，将本项目中 `index.js` 的代码完整覆盖进去，点击 **Save and Deploy**。

### 第二步：绑定独立自定义域名（关键）
为了绕过默认域名在境内的网络干扰，并安全开启 ECH 保护：
1. 在刚刚创建的 Worker 页面中，切换到 **设置 (Settings)** -> **域和路由 (Domains & Routes)**。
2. 点击 **添加 (Add)** -> 选择 **自定义域 (Custom Domain)**。
3. 填入你托管在 CF 上的二级域名（例如：`doh.yourdomain.com`），点击绑定。

### 第三步：关闭默认分配域名（防白嫖）
1. 在 Worker 页面右侧找到 **Worker URL** 区域。
2. 将默认自动生成的 `*.workers.dev` 域名开关**关闭**，仅保留你自己的独立自定义域名。

---

## ⚙️ 客户端最佳分工配置

配合代理软件进行**分流网络优化**：

### 1. 国内常规 DNS（走直连，追求极速）
用于解析国内微信、淘宝、国内游戏等，保留极低延迟：
- `https://dns.alidns.com/dns-query`
- `https://doh.pub/dns-query`

### 2. 代理/远程 DNS（走自建，追求绝对隐私）
在软件的 `proxy-server-dns` 或远程 DNS 中填入你的专属地址：
- `https://doh.yourdomain.com/dns-query`

---

## 🔍 验证运行状态
- **后台指标**：访问海外网站后，登录 CF 后台查看该 Worker 的 **Metrics**，若 `Requests` 图表有波动且错误率为 0，即代表成功运行。

