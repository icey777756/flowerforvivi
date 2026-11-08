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
  const SEND_KEY = "";

  const endpoint =
    PUSH_ENDPOINT ||
    (SEND_KEY ? `https://sctapi.ftqq.com/${SEND_KEY}.send` : "");
  if (!endpoint) return;

  // 本地开发、隐私模式或用户明确拒绝跟踪时不发送
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(location.hostname)) {
    return;
  }
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  // 20 秒内重复刷新只记一次，避免误触刷屏
  const STORAGE_KEY = "vivi-visit-ping";
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

  function send() {
    const now = new Date();
    const lines = [
      `### ${formatBeijing(now)}（北京时间）`,
      "",
      `- 页面：${location.href}`,
      `- 来源：${document.referrer ? document.referrer.slice(0, 180) : "直接打开 / 无来源"}`,
      `- 设备：${describeDevice()}`,
      `- 屏幕：${window.screen.width}×${window.screen.height} @${window.devicePixelRatio || 1}x`,
      `- 语言：${navigator.language}`,
      `- 访问者本地时间：${now.toLocaleString()}`,
    ];
    const query = [
      `title=${encodeURIComponent("Flower for Vivi · 有人打开了网站")}`,
      `desp=${encodeURIComponent(lines.join("\n"))}`,
    ].join("&");
    const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;

    // Server酱只接受 GET；no-cors 无需读取响应即可送达
    fetch(url, { mode: "no-cors", keepalive: true }).catch(() => {});
  }

  if (document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
})();
