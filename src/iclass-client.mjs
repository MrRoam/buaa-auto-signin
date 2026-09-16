import { URLSearchParams } from "node:url";
import { dateStrYYYYMMDDInChina } from "./schedule-source.mjs";
import { resolveIclassLoginName } from "./buaa-sso.mjs";

export class IclassClient {
  constructor({ studentId, password = "", iclassLoginName = "", logger }) {
    this.studentId = studentId;
    this.password = password;
    this.iclassLoginName = normalizeLoginName(iclassLoginName);
    this.logger = logger;
    this.userId = null;
    this.sessionId = null;
    this.requestNonce = 0;
  }

  clearSession() {
    this.userId = null;
    this.sessionId = null;
  }

  async login(options = {}) {
    if (!options.force && this.userId && this.sessionId) return true;
    if (options.force) this.clearSession();

    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.loginOnce();
        return true;
      } catch (error) {
        lastError = error;
        this.clearSession();
        if (attempt < 2) {
          this.logger?.warn?.("iclass 登录异常，刷新请求后重试", { message: error.message });
          continue;
        }
      }
    }
    throw lastError;
  }

  async loginOnce() {
    if (!this.iclassLoginName && this.password) {
      this.logger?.info?.("正在通过统一认证连接 iClass……");
      this.iclassLoginName = await resolveIclassLoginName({
        studentId: this.studentId,
        password: this.password,
      });
    }
    const url = new URL("https://iclass.buaa.edu.cn:8347/app/user/login.action");
    url.search = new URLSearchParams({
      password: "",
      phone: this.loginPhone(),
      userLevel: "1",
      verificationType: "2",
      verificationUrl: "",
    }).toString();
    this.markFresh(url);

    const payload = await getJson(url, { logger: this.logger, label: "iclass login" });
    assertIclassOk(payload, "iclass 登录", {
      userNotFoundHint: this.iclassLoginName
        ? ""
        : "请运行 npm run setup 填写统一认证密码，程序会自动获取 iClass 登录信息。",
    });
    this.userId = String(payload?.result?.id || "");
    this.sessionId = String(payload?.result?.sessionId || "");
    if (!this.userId || !this.sessionId) throw new Error("iclass 登录响应缺少 userId/sessionId。 ");
    return true;
  }

  async getClasses(date = new Date()) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.login({ force: attempt > 1 });
      try {
        return await this.getClassesOnce(date);
      } catch (error) {
        lastError = error;
        this.clearSession();
        if (attempt < 2) {
          this.logger?.warn?.("iclass 远程课表请求异常，重新登录后重试", { message: error.message });
          continue;
        }
      }
    }
    throw lastError;
  }

  async getClassesOnce(date = new Date()) {
    const url = new URL("https://iclass.buaa.edu.cn:8347/app/course/get_stu_course_sched.action");
    url.search = new URLSearchParams({
      id: this.userId,
      dateStr: dateStrYYYYMMDDInChina(date),
    }).toString();
    this.markFresh(url);
    const payload = await getJson(url, {
      logger: this.logger,
      label: "iclass get classes",
      headers: { sessionId: this.sessionId },
    });
    if (Number(payload?.STATUS) === 2) return [];
    assertIclassOk(payload, "iclass 远程课表");
    const result = Array.isArray(payload?.result) ? payload.result : [];
    return result.map((item) => ({
      courseId: String(item.id || ""),
      courseName: String(item.courseName || ""),
      classBeginTime: String(item.classBeginTime || ""),
      classEndTime: String(item.classEndTime || ""),
      signStatus: Number(item.signStatus || 0),
      raw: item,
    }));
  }

  async signIn(courseSchedId) {
    await this.login();
    const timestampUrl = new URL("http://iclass.buaa.edu.cn:8081/app/common/get_timestamp.action");
    this.markFresh(timestampUrl);
    const timestampPayload = await getJson(timestampUrl, {
      logger: this.logger,
      label: "iclass timestamp",
    });
    const timestamp = String(timestampPayload?.timestamp || "");
    if (!timestamp) throw new Error("获取 iclass 服务器时间失败。 ");

    const url = new URL("http://iclass.buaa.edu.cn:8081/app/course/stu_scan_sign.action");
    url.search = new URLSearchParams({ courseSchedId: String(courseSchedId), timestamp }).toString();
    this.markFresh(url);
    const body = new URLSearchParams({ id: this.userId }).toString();
    const payload = await getJson(url, {
      logger: this.logger,
      label: "iclass sign in",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", sessionId: this.sessionId },
      body,
    });
    const success = Number(payload?.STATUS) === 0 && Number(payload?.result?.stuSignStatus) === 1;
    return { success, message: sanitizeSignInMessage(success, payload?.ERRMSG), raw: payload };
  }

  markFresh(url) {
    url.searchParams.set("_", `${Date.now()}-${this.requestNonce += 1}`);
  }

  loginPhone() {
    return this.iclassLoginName || this.studentId;
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: noCacheHeaders(options.headers),
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.label || "request"} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${options.label || "request"} 返回不是 JSON：${text.slice(0, 200)}`);
  }
}

function noCacheHeaders(headers = {}) {
  return {
    "Cache-Control": "no-cache",
    Connection: "close",
    Pragma: "no-cache",
    ...headers,
  };
}

function assertIclassOk(payload, label, options = {}) {
  if (Number(payload?.STATUS) !== 0) {
    const message = String(payload?.ERRMSG || "未知错误");
    const hint = options.userNotFoundHint && message.includes("用户不存在") ? ` ${options.userNotFoundHint}` : "";
    throw new Error(`${label}失败：${message}${hint}`);
  }
}

function normalizeLoginName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function sanitizeSignInMessage(success, rawMessage) {
  if (success) return rawMessage || "签到成功";
  const message = String(rawMessage || "");
  if (message.includes("已签到")) return "您今天已经签到过了";
  if (message.includes("未开始")) return "当前还未到签到时间";
  if (message.includes("不是上课时间")) return "当前不是上课时间，无法签到";
  if (message.includes("已结束")) return "本次签到已结束";
  if (message.includes("范围")) return "当前不在可签到范围内";
  if (message.includes("课程") && message.includes("不存在")) return "未找到对应课程，请刷新后重试";
  return message || "签到失败，请稍后重试";
}
