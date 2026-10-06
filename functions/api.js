// functions/api.js — Cloudflare Pages Function：/api/?url=<目标> 的自建代理
//
// 页面(xhs_lite.html / index.html)在「⚙️ 设置」里填入
//   https://你的站点.pages.dev/api
// 即可让解析、封面、预览都走这个代理：稳定、不经过第三方公共代理。
// 白名单只放行小红书相关域名，防止被滥用为开放代理。

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

export async function onRequest(context) {
  const u = new URL(context.request.url);
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
}
