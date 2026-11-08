/* ------------------------------------------------------------------ *
 * 访问通知 · Server酱
 *
 * 配置方式见「访问通知设置.md」。
 * 未填写 PUSH_ENDPOINT / SEND_KEY 时，本脚本不会发送任何请求。
 * ------------------------------------------------------------------ */

(() => {
  "use strict";

  // 推荐：Server酱³ 的完整推送地址，形如
  // https://1234567890.push.ft07.com/send/sctpXXXXXXXXXXXXXXXX.send
  const PUSH_ENDPOINT = "";

  // 旧版 Server酱：只填 SendKey，会自动拼成
  // https://sctapi.ftqq.com/<SendKey>.send
  const SEND_KEY = "SCT465373TQglOD84yTEzgaPX82QkHn0zX";

  const endpoint =
    PUSH_ENDPOINT ||
    (SEND_KEY ? `https://sctapi.ftqq.com/${SEND_KEY}.send` : "");
  if (!endpoint) return;

  // 本地开发、隐私模式或用户明确拒绝跟踪时不发送
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(location.hostname)) {
    return;
  }
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  // One notification per site, per 20s. All project sites share the
  // icey777756.github.io origin, so the path segment is part of the key.
  const siteSegment =
    (location.pathname.split("/").filter(Boolean)[0] || "root").toLowerCase();
  const SITE_NAMES = {
    flowerforvivi: "Flower for Vivi",
    lovexizhou: "致 西洲",
    "rosa-vivida": "ROSA VIVIDA",
    "jellyfish-bedroom": "水母卧室",
    "jellyfish-hands": "水母手势",
    root: "主页",
  };
  const siteName = (
    SITE_NAMES[siteSegment] ||
    document.title.split(/[·|｜|—]/)[0].trim() ||
    (siteSegment === "root" ? "主页" : siteSegment)
  ).slice(0, 20);
  const STORAGE_KEY = `vivi-visit-ping:${siteSegment}`;
  try {
    const last = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (Date.now() - last < 20000) return;
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* 隐私模式下 sessionStorage 可能不可用，照常发送 */
  }

  function describeDevice() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Macintosh/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows";
    return "其他设备";
  }

  function formatBeijing(date) {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  // City-level lookup only. The visitor's IP is seen by the lookup service,
  // never by us; we keep only country / province / city in the message.
  const LOCATION_PROVIDERS = [
    {
      url: "https://ipapi.co/json/",
      parse: (data) => ({
        country: data.country_name,
        region: data.region,
        city: data.city,
      }),
    },
    {
      url: "https://get.geojs.io/v1/ip/geo.json",
      parse: (data) => ({
        country: data.country,
        region: data.region,
        city: data.city,
      }),
    },
  ];

  async function lookupLocation() {
    let countryOnly = null;
    for (const provider of LOCATION_PROVIDERS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(provider.url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) continue;
        const data = await response.json();
        const geo = provider.parse(data);
        if (geo && (geo.city || geo.region)) return geo;
        if (geo && geo.country && !countryOnly) countryOnly = geo;
      } catch {
        /* try the next provider */
      } finally {
        clearTimeout(timer);
      }
    }
    return countryOnly;
  }

  function formatLocation(geo) {
    if (!geo) return "未知（IP 归属地查询失败）";
    const parts = [geo.country, geo.region, geo.city].filter(Boolean);
    return parts.length ? parts.join(" · ") : "未知";
  }

  async function send() {
    const now = new Date();
    const geo = await lookupLocation();
    const lines = [
      `### ${formatBeijing(now)}（北京时间）`,
      "",
      `- 地区：${formatLocation(geo)}（仅到市）`,
      `- 站点：${siteName}`,
      `- 页面：${location.href}`,
      `- 来源：${document.referrer ? document.referrer.slice(0, 180) : "直接打开 / 无来源"}`,
      `- 设备：${describeDevice()}`,
      `- 屏幕：${window.screen.width}×${window.screen.height} @${window.devicePixelRatio || 1}x`,
      `- 语言：${navigator.language}`,
      `- 访问者本地时间：${now.toLocaleString()}`,
    ];
    const query = [
      `title=${encodeURIComponent(`有人打开了 ${siteName}`)}`,
      `desp=${encodeURIComponent(lines.join("\n"))}`,
    ].join("&");
    const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;

    // Server酱只接受 GET；no-cors 无需读取响应即可送达
    fetch(url, { mode: "no-cors", keepalive: true }).catch(() => {});
  }

  if (document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
})();
