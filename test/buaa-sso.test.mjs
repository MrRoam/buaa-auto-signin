import test from "node:test";
import assert from "node:assert/strict";
import { CookieSession, resolveIclassLoginName } from "../src/buaa-sso.mjs";

test("resolveIclassLoginName follows BUAA SSO and extracts the iClass login name", async () => {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push({
      url: url.toString(),
      method: options.method || "GET",
      body: options.body || "",
      cookie: String(options.headers?.get?.("cookie") || ""),
    });

    if (url.hostname === "iclass.buaa.edu.cn" && url.port === "8346" && !url.searchParams.has("loginName")) {
      return redirect("https://sso.buaa.edu.cn/login?service=https%3A%2F%2Ficlass.buaa.edu.cn%3A8346%2F%3Ftype%3DjumpMyCenter");
    }
    if (url.hostname === "sso.buaa.edu.cn" && (options.method || "GET") === "GET") {
      return html('<form><input name="execution" value="exec-1"><input name="lt" value="LT-1"><input name="_eventId" value="submit"></form>', {
        "set-cookie": "sso_session=abc; Path=/; HttpOnly, shared_session=shared; Domain=buaa.edu.cn; Path=/; Secure",
      });
    }
    if (url.hostname === "sso.buaa.edu.cn" && options.method === "POST") {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("username"), "mock-student-id");
      assert.equal(body.get("password"), "mock-password");
      assert.equal(body.get("execution"), "exec-1");
      assert.match(String(options.headers.get("cookie")), /sso_session=abc/);
      return redirect("https://iclass.buaa.edu.cn:8346/?type=jumpMyCenter&loginName=encoded%253Dvalue", {
        "set-cookie": "CASTGC=ticket; Path=/; HttpOnly",
      });
    }
    if (url.searchParams.has("loginName")) return html("iClass ready");
    throw new Error(`Unexpected request: ${url}`);
  };

  const loginName = await resolveIclassLoginName({
    studentId: "mock-student-id",
    password: "mock-password",
    fetchImpl,
  });

  assert.equal(loginName, "encoded%3Dvalue");
  assert.equal(requests.length, 4);
  assert.doesNotMatch(requests[3].cookie, /sso_session/);
  assert.match(requests[3].cookie, /shared_session=shared/);
});

test("resolveIclassLoginName rejects redirects outside the expected HTTPS BUAA hosts", async () => {
  const fetchImpl = async () => redirect("https://attacker.example/login");
  await assert.rejects(
    () => resolveIclassLoginName({ studentId: "student", password: "password", fetchImpl }),
    /非预期的跳转目标/,
  );
});

test("CookieSession expires deleted cookies and applies the RFC default path", () => {
  const session = new CookieSession(fetch);
  session.absorbCookies(
    new Headers({ "set-cookie": "expired=gone; Expires=Thu, 01 Jan 1970 00:00:00 GMT, scoped=ok; Secure" }),
    "https://sso.buaa.edu.cn/account/login",
  );
  assert.equal(session.cookieHeader("https://sso.buaa.edu.cn/account/next"), "scoped=ok");
  assert.equal(session.cookieHeader("https://sso.buaa.edu.cn/accounts"), "");

  session.absorbCookies(
    new Headers({ "set-cookie": "scoped=gone; Path=/account; Max-Age=0" }),
    "https://sso.buaa.edu.cn/account/login",
  );
  assert.equal(session.cookieHeader("https://sso.buaa.edu.cn/account/next"), "");
});

function redirect(location, headers = {}) {
  return new Response("", { status: 302, headers: { location, ...headers } });
}

function html(body, headers = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });
}
