const ICLASS_ENTRY = "https://iclass.buaa.edu.cn:8346/?type=jumpMyCenter";
const MAX_REDIRECTS = 12;

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
    throw new Error("统一认证当前要求验证码，请先在浏览器登录一次后重试。");
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

class CookieSession {
  constructor(fetchImpl) {
    this.fetchImpl = fetchImpl;
    this.cookies = new Map();
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
      const headers = new Headers({
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135 Safari/537.36",
        ...(requestInit.headers || {}),
      });
      if (this.cookies.size) {
        headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
      }
      const response = await this.fetchImpl(currentUrl, { ...requestInit, headers, redirect: "manual" });
      this.absorbCookies(response.headers);
      const body = await response.text();
      if (response.status < 300 || response.status >= 400) {
        return { response, body, url: currentUrl };
      }
      const location = response.headers.get("location");
      if (!location) return { response, body, url: currentUrl };
      currentUrl = new URL(location, currentUrl).toString();
      const method = String(requestInit.method || "GET").toUpperCase();
      if (response.status === 303 || ([301, 302].includes(response.status) && method === "POST")) {
        requestInit = { method: "GET" };
      }
    }
    throw new Error("统一认证重定向次数过多。");
  }

  absorbCookies(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie") || "");
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]*)/g);
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

