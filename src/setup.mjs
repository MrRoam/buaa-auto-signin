#!/usr/bin/env node
import path from "node:path";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { IclassClient } from "./iclass-client.mjs";
import { assertSupportedNode } from "./runtime.mjs";
import { writePrivateJson } from "./private-config.mjs";

assertSupportedNode();

const configPath = path.resolve(process.cwd(), "config.json");
console.log("\n北航 iClass 签到助手 - 首次配置\n");
console.log("账号信息只保存在本机 config.json；该文件已被 Git 忽略。\n");

const studentId = (await ask("学号：")).trim();
if (!studentId) fail("学号不能为空。");
const password = await askHidden("统一认证密码：");
if (!password) fail("密码不能为空。");

stdout.write("正在验证账号并连接 iClass……");
try {
  const client = new IclassClient({ studentId, password });
  const classes = await client.getClasses(new Date());
  stdout.write(`成功（今天获取到 ${classes.length} 节课堂）。\n`);
} catch (error) {
  stdout.write("失败。\n");
  fail(error.message);
}

const config = {
  studentId,
  password,
  triggerMinutesBeforeClass: 9,
  pollIntervalSeconds: 20,
  remoteRefreshSeconds: 900,
  mode: "auto",
  writeLogs: true,
};
writePrivateJson(configPath, config);
console.log(`配置已保存到 ${configPath}`);
console.log("自动运行：npm start    手动签到：npm run signin\n");

function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

function askHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return ask(question);
  return new Promise((resolve) => {
    stdout.write(question);
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onKeypress = (text, key) => {
      if (key?.name === "return" || key?.name === "enter") {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        resolve(value);
      } else if (key?.name === "backspace") {
        value = value.slice(0, -1);
      } else if (key?.ctrl && key?.name === "c") {
        stdin.setRawMode(false);
        process.exit(130);
      } else if (text && !key?.ctrl && !key?.meta) {
        value += text;
      }
    };
    stdin.on("keypress", onKeypress);
  });
}

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}
