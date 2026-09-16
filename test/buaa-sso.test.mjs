import test from "node:test";
import assert from "node:assert/strict";
import { resolveIclassLoginName } from "../src/buaa-sso.mjs";

test("resolveIclassLoginName follows BUAA SSO and extracts the iClass login name", async () => {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push({ url: url.toString(), method: options.method || "GET", body: options.body || "" });

    if (url.hostname === "iclass.buaa.edu.cn" && url.port === "8346" && !url.searchParams.has("loginName")) {
      return redirect("https://sso.buaa.edu.cn/login?service=https%3A%2F%2Ficlass.buaa.edu.cn%3A8346%2F%3Ftype%3DjumpMyCenter");
    }
    if (url.hostname === "sso.buaa.edu.cn" && (options.method || "GET") === "GET") {
      return html('<form><input name="execution" value="exec-1"><input name="lt" value="LT-1"><input name="_eventId" value="submit"></form>', {
        "set-cookie": "sso_session=abc; Path=/; HttpOnly",
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
});

function redirect(location, headers = {}) {
  return new Response("", { status: 302, headers: { location, ...headers } });
}

function html(body, headers = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });
}

