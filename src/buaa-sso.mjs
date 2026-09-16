import { fetchTextWithTimeout } from "./http-utils.mjs";

const ICLASS_ENTRY = "https://iclass.buaa.edu.cn:8346/?type=jumpMyCenter";
const MAX_REDIRECTS = 12;
const ALLOWED_HOSTS = new Set(["sso.buaa.edu.cn", "iclass.buaa.edu.cn"]);

export async function resolveIclassLoginName({ studentId, password, fetchImpl = fetch }) {
  if (!String(studentId || "").trim() || !String(password || "")) {
    throw new Error("自动获取 iClass 登录信息需要学号和统一认证密码。");
  }

  const client = new CookieSession(fetchImpl);
  const loginPage = await client.get(ICLASS_ENTRY);
  ensureOk(loginPage, "打开统一认证登录页");
  const execution = inputValue(loginPage.body, "execution");
  if (!execution) throw new Error("统一认证页面缺少 execution 参数，登录流程可能已变化。");
  if (requiresCaptcha(loginPage.body)) {
    throw new Error("统一认证当前要求验证码，本工具暂不支持该验证流程。请稍后重试；若持续出现，请改用学校官方页面签到。");
  }

  const form = collectLoginFields(loginPage.body);
  form.username = String(studentId).trim();
  form.password = String(password);
  form.execution = execution;
  form._eventId ||= "submit";
  form.type ||= "username_password";
  form.submit ||= "LOGIN";

  const result = await client.postForm(loginPage.url, form);
  ensureOk(result, "统一认证登录");
  const failure = loginFailure(result.body);
  if (failure) throw new Error(`统一认证登录失败：${failure}`);
  if (/name=["']execution["']/i.test(result.body)) {
    throw new Error("统一认证登录失败，请检查学号、密码或验证码状态。");
  }

  const loginName = extractLoginName(result.url, result.body);
  if (!loginName) {
    throw new Error("统一认证成功，但 iClass 未返回 loginName；学校登录流程可能已变化。");
  }
  return loginName;
}

export class CookieSession {
  constructor(fetchImpl) {
    this.fetchImpl = fetchImpl;
    this.cookies = [];
  }

  get(url) {
    return this.request(url, { method: "GET" });
  }

  postForm(url, fields) {
    return this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(fields).toString(),
    });
  }

  async request(url, init) {
    let currentUrl = String(url);
    let requestInit = { ...init };
    for (let count = 0; count < MAX_REDIRECTS; count += 1) {
      assertAllowedUrl(currentUrl);
      const headers = new Headers({
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135 Safari/537.36",
        ...(requestInit.headers || {}),
      });
      const cookieHeader = this.cookieHeader(currentUrl);
      if (cookieHeader) headers.set("Cookie", cookieHeader);
      const fetched = await fetchTextWithTimeout(this.fetchImpl, currentUrl, { ...requestInit, headers, redirect: "manual" });
      const { response, text: body } = fetched;
      this.absorbCookies(response.headers, currentUrl);
      if (response.status < 300 || response.status >= 400) {
        return { response, body, url: currentUrl };
      }
      const location = response.headers.get("location");
      if (!location) return { response, body, url: currentUrl };
      currentUrl = new URL(location, currentUrl).toString();
      assertAllowedUrl(currentUrl);
      const method = String(requestInit.method || "GET").toUpperCase();
      if (response.status === 303 || ([301, 302].includes(response.status) && method === "POST")) {
        requestInit = { method: "GET" };
      }
    }
    throw new Error("统一认证重定向次数过多。");
  }

  cookieHeader(requestUrl) {
    const url = new URL(requestUrl);
    const now = Date.now();
    this.cookies = this.cookies.filter((cookie) => cookie.expiresAt === null || cookie.expiresAt > now);
    return this.cookies
      .filter((cookie) => cookieMatches(cookie, url))
      .sort((a, b) => b.path.length - a.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  absorbCookies(headers, requestUrl) {
    const rawValues = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") || ""];
    const values = rawValues.flatMap(splitSetCookie);
    for (const value of values) {
      const cookie = parseSetCookie(value, new URL(requestUrl));
      if (!cookie) continue;
      this.cookies = this.cookies.filter((entry) => !(
        entry.name === cookie.name && entry.domain === cookie.domain && entry.path === cookie.path
      ));
      if (cookie.expiresAt === null || cookie.expiresAt > Date.now()) this.cookies.push(cookie);
    }
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]*)/g);
}

function parseSetCookie(header, requestUrl) {
  const chunks = header.split(";").map((part) => part.trim());
  const separator = chunks[0]?.indexOf("=") ?? -1;
  if (separator <= 0) return null;
  const cookie = {
    name: chunks[0].slice(0, separator).trim(),
    value: chunks[0].slice(separator + 1).trim(),
    domain: requestUrl.hostname.toLowerCase(),
    hostOnly: true,
    path: defaultCookiePath(requestUrl.pathname),
    secure: false,
    expiresAt: null,
  };
  for (const chunk of chunks.slice(1)) {
    const index = chunk.indexOf("=");
    const name = (index < 0 ? chunk : chunk.slice(0, index)).trim().toLowerCase();
    const value = index < 0 ? "" : chunk.slice(index + 1).trim();
    if (name === "domain") {
      const domain = value.replace(/^\./, "").toLowerCase();
      if (!domainMatch(requestUrl.hostname, domain)) return null;
      cookie.domain = domain;
      cookie.hostOnly = false;
    } else if (name === "path" && value.startsWith("/")) {
      cookie.path = value;
    } else if (name === "secure") {
      cookie.secure = true;
    } else if (name === "max-age" && /^-?\d+$/.test(value)) {
      cookie.expiresAt = Date.now() + Number(value) * 1000;
    } else if (name === "expires" && cookie.expiresAt === null) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) cookie.expiresAt = parsed;
    }
  }
  return cookie;
}

function cookieMatches(cookie, url) {
  const domainOk = cookie.hostOnly
    ? url.hostname.toLowerCase() === cookie.domain
    : domainMatch(url.hostname, cookie.domain);
  const pathOk = url.pathname === cookie.path
    || url.pathname.startsWith(cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`);
  return domainOk && pathOk && (!cookie.secure || url.protocol === "https:");
}

function domainMatch(hostname, domain) {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function defaultCookiePath(pathname) {
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const rightMostSlash = pathname.lastIndexOf("/");
  return rightMostSlash === 0 ? "/" : pathname.slice(0, rightMostSlash);
}

function assertAllowedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`统一认证拒绝了不安全或非预期的跳转目标：${url.protocol}//${url.host}`);
  }
}

function collectLoginFields(html) {
  const fields = {};
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    const name = attribute(tag, "name");
    const type = attribute(tag, "type").toLowerCase();
    if (!name || ["username", "password"].includes(name) || ["button", "image"].includes(type)) continue;
    if (type === "checkbox" && !/\bchecked\b/i.test(tag)) continue;
    if (type === "submit" && name !== "submit") continue;
    fields[name] = attribute(tag, "value") || (type === "checkbox" ? "on" : "");
  }
  return fields;
}

function inputValue(html, name) {
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    if (attribute(tag, "name") === name) return attribute(tag, "value");
  }
  return "";
}

function attribute(tag, name) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1]
    || tag.match(new RegExp(`${name}\\s*=\\s*([^\\s"'=><]+)`, "i"))?.[1]
    || "";
}

function requiresCaptcha(html) {
  return /config\.captcha\s*=\s*\{/i.test(html) || /captchaId=/i.test(html);
}

function loginFailure(html) {
  return decodeHtml(html.match(/<div class=["']tip-text["']>([^<]+)<\/div>/i)?.[1] || "").trim();
}

function extractLoginName(finalUrl, html) {
  try {
    const value = new URL(finalUrl).searchParams.get("loginName");
    if (value) return value.trim();
  } catch {}
  const match = String(html).match(/[?&]loginName=([^&"'<>\s]+)/i)
    || String(html).match(/["']loginName["']\s*:\s*["']([^"']+)/i);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function ensureOk(result, label) {
  if (!result.response.ok) throw new Error(`${label}失败：HTTP ${result.response.status}`);
}
