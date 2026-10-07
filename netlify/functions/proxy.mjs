// Netlify Function（v2）：/api（经 netlify.toml 重写）→ 本函数
// 通用代理：小红书页面/资源 + 抖音分享页。
// 抖音分享页有波动性风控：这里用 手机UA + 两段式攒cookie + 重试，
// 直到拿到含 item_list 的完整页面再返回给前端解析。
// 白名单只放行小红书/抖音自家域名，防止被滥用为开放代理。

const UA_DESKTOP = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
const UA_MOBILE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");

const OK_DOMAINS = ["xiaohongshu.com", "xhslink.cn", "xhslink.com", "xhscdn.com",
                    "douyin.com", "iesdouyin.com", "snssdk.com", "douyinpic.com", "zjcdn.com"];

const okHost = (h) => {
  h = (h || "").toLowerCase();
  return OK_DOMAINS.some(d => h === d || h.endsWith("." + d));
};

const json = (msg, code) =>
  new Response(msg, { status: code, headers: { "Access-Control-Allow-Origin": "*" } });

const isDouyin = (u) => /douyin\.com|iesdouyin\.com|snssdk\.com/i.test(u || "");

export default async function handler(request) {
  const u = new URL(request.url);
  const target = u.searchParams.get("url") || "";
  let host;
  try { host = new URL(target).hostname; }
  catch (e) { return json("缺少合法的 url 参数", 400); }
  if (!okHost(host)) return json("仅支持小红书/抖音相关域名", 403);

  // ---- 抖音分享页：手机UA + 两段式攒cookie + 重试，直到拿到 item_list ----
  if (isDouyin(target)) {
    let cookies = [];
    let text = "";
    for (let i = 0; i < 4; i++) {
      const h = { "User-Agent": UA_MOBILE, "Accept-Language": "zh-CN,zh;q=0.9" };
      if (cookies.length) h.Cookie = cookies.join("; ");
      let resp;
      try {
        resp = await fetch(target, { headers: h, redirect: "follow" });
      } catch (e) {
        return json("上游请求失败: " + e.message, 502);
      }
      const setc = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
      for (const c of setc) cookies.push(c.split(";")[0]);
      text = await resp.text();
      if (text.includes('"item_list":[{"')) break;
    }
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8",
                 "Access-Control-Allow-Origin": "*",
                 "Cache-Control": "no-store" },
    });
  }

  // ---- 小红书页面/资源 ----
  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": UA_DESKTOP, "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
    });
  } catch (e) {
    return json("上游请求失败: " + e.message, 502);
  }

  // xhslink.cn 等短链会 302 到登录页，真实笔记地址藏在 redirectPath 参数里
  if ((upstream.url || "").includes("/login")) {
    const real = new URL(upstream.url).searchParams.get("redirectPath");
    let host2 = "";
    try { host2 = new URL(real || "").hostname; } catch (e) {}
    if (real && okHost(host2)) {
      try {
        upstream = await fetch(real, {
          headers: { "User-Agent": UA_DESKTOP, "Accept-Language": "zh-CN,zh;q=0.9" },
          redirect: "follow",
        });
      } catch (e) {}
    }
  }

  const headers = new Headers();
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"])
    if (upstream.headers.has(h)) headers.set(h, upstream.headers.get(h));
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
