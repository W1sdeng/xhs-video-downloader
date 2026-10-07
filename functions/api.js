// functions/api.js — Cloudflare Pages Function：/api/?url=<目标> 的自建代理
//
// 页面(xhs_lite.html / index.html)在「⚙️ 设置」里填入
//   https://你的站点.pages.dev/api
// 即可让解析、封面、预览都走这个代理：稳定、不经过第三方公共代理。
// 白名单只放行小红书相关域名，防止被滥用为开放代理。

const UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
const UA_MOBILE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  return (h === "xiaohongshu.com" || h.endsWith(".xiaohongshu.com") ||
          h === "xhslink.cn"     || h.endsWith(".xhslink.cn") ||
          h === "xhslink.com"    || h.endsWith(".xhslink.com") ||
          h === "xhscdn.com"     || h.endsWith(".xhscdn.com") ||
          h === "douyin.com"     || h.endsWith(".douyin.com") ||
          h === "iesdouyin.com"  || h.endsWith(".iesdouyin.com") ||
          h === "snssdk.com"     || h.endsWith(".snssdk.com") ||
          h === "douyinpic.com"  || h.endsWith(".douyinpic.com"));
}

function respond(body, status, extraHeaders) {
  const headers = new Headers(extraHeaders || {});
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "*");
  return new Response(body, { status, headers });
}

export async function onRequest(context) {
  const u = new URL(context.request.url);
  const target = u.searchParams.get("url") || "";
  let host;
  try { host = new URL(target).hostname; }
  catch (e) { return respond("缺少合法的 url 参数", 400); }
  if (!isAllowedHost(host))
    return respond("仅支持小红书/抖音相关域名", 403);

  // ---- 抖音分享页：手机UA + 两段式攒cookie + 重试，直到拿到 item_list ----
  if (/douyin\.com|iesdouyin\.com|snssdk\.com/i.test(target)) {
    let cookies = [];
    let text = "";
    for (let i = 0; i < 4; i++) {
      const h = { "User-Agent": UA_MOBILE, "Accept-Language": "zh-CN,zh;q=0.9" };
      if (cookies.length) h.Cookie = cookies.join("; ");
      let resp;
      try {
        resp = await fetch(target, { headers: h, redirect: "follow" });
      } catch (e) {
        return respond("上游请求失败: " + e.message, 502);
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

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
    });
  } catch (e) {
    return respond("上游请求失败: " + e.message, 502);
  }

  // xhslink.cn 等短链会 302 到登录页，真实笔记地址藏在 redirectPath 参数里
  if ((upstream.url || "").includes("/login")) {
    const real = new URL(upstream.url).searchParams.get("redirectPath");
    let host2 = "";
    try { host2 = new URL(real || "").hostname; } catch (e) {}
    if (real && isAllowedHost(host2)) {
      try {
        upstream = await fetch(real, {
          headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
          redirect: "follow",
        });
      } catch (e) {}
    }
  }

  const headers = new Headers();
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"])
    if (upstream.headers.has(h)) headers.set(h, upstream.headers.get(h));
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
