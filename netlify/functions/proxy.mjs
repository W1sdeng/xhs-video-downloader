// Netlify Function（v2）：/api（经 netlify.toml 重写）→ 本函数
// 代理 /api/?url=<目标>，白名单只放行小红书相关域名。

const UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

const okHost = (h) => {
  h = (h || "").toLowerCase();
  return ["xiaohongshu.com", "xhslink.com", "xhscdn.com"]
    .some(d => h === d || h.endsWith("." + d));
};

const json = (msg, code) =>
  new Response(msg, { status: code, headers: { "Access-Control-Allow-Origin": "*" } });

export default async function handler(request) {
  const u = new URL(request.url);
  const target = u.searchParams.get("url") || "";
  let host;
  try { host = new URL(target).hostname; }
  catch (e) { return json("缺少合法的 url 参数", 400); }
  if (!okHost(host)) return json("仅支持小红书相关域名", 403);

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
      redirect: "follow",
    });
  } catch (e) {
    return json("上游请求失败: " + e.message, 502);
  }

  const headers = new Headers();
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"])
    if (upstream.headers.has(h)) headers.set(h, upstream.headers.get(h));
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
