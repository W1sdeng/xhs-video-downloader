// worker.js — 小红书下载器自建代理（Cloudflare Worker，免费额度足够个人用）
//
// 部署方法（约 3 分钟）：
//   1. 注册/登录 https://dash.cloudflare.com  → 左侧 Workers & Pages → Create
//   2. 选 "Create Worker" → 随便起名 → Deploy
//   3. 点 "Edit code"，把本文件全部代码粘贴进去，覆盖原有内容 → Deploy
//   4. 复制页面给出的地址（形如 https://你的名字.你的子域.workers.dev）
//   5. 打开 xhs_lite.html 的「⚙️ 设置」，粘贴该地址并保存
//
// 之后轻量版页面会优先走你自己的代理：稳定、不经过任何第三方代理服务。

const UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  return (h === "xiaohongshu.com" || h.endsWith(".xiaohongshu.com") ||
          h === "xhslink.com"    || h.endsWith(".xhslink.com") ||
          h === "xhscdn.com"     || h.endsWith(".xhscdn.com"));
}

function respond(body, status, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "*");
  return new Response(body, { status, headers });
}

export default {
  async fetch(request) {
    const u = new URL(request.url);
    const target = u.searchParams.get("url") || "";
    let host;
    try { host = new URL(target).hostname; }
    catch (e) { return respond("缺少合法的 url 参数", 400); }
    if (!isAllowedHost(host))
      return respond("仅支持小红书相关域名", 403);

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        redirect: "follow",
      });
    } catch (e) {
      return respond("上游请求失败: " + e.message, 502);
    }

    const headers = new Headers();
    for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"])
      if (upstream.headers.has(h)) headers.set(h, upstream.headers.get(h));
    headers.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
