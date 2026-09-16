#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs, loadConfig } from "./config.mjs";
import { IclassClient } from "./iclass-client.mjs";

const args = parseArgs();
const config = loadConfig(args.configPath);
if (config.allowInsecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new IclassClient({
  studentId: config.studentId,
  password: config.password,
  iclassLoginName: config.iclassLoginName,
});

console.log("正在获取今天的 iClass 课堂……");
const classes = await client.getClasses(new Date());
if (!classes.length) {
  console.log("今天没有可显示的 iClass 课堂。");
  process.exit(0);
}

classes.forEach((item, index) => {
  const status = item.signStatus === 1 ? "已签到" : "未签到";
  console.log(`${index + 1}. ${item.classBeginTime}-${item.classEndTime}  ${item.courseName}  [${status}]`);
});

const rl = readline.createInterface({ input: stdin, output: stdout });
const answer = (await rl.question("\n输入要签到的序号（输入 q 取消）：")).trim();
if (/^q$/i.test(answer)) {
  rl.close();
  console.log("已取消。");
  process.exit(0);
}
const index = Number(answer) - 1;
if (!Number.isInteger(index) || index < 0 || index >= classes.length) {
  rl.close();
  throw new Error("无效的课堂序号。");
}
const selected = classes[index];
const confirmation = (await rl.question(`确认提交“${selected.courseName}”签到？输入 y 确认：`)).trim();
rl.close();
if (!/^y(es)?$/i.test(confirmation)) {
  console.log("已取消。");
  process.exit(0);
}

const result = await client.signIn(selected.courseId);
console.log(result.success ? `签到成功：${result.message}` : `签到失败：${result.message}`);
if (!result.success) process.exitCode = 1;

