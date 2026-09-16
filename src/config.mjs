import fs from "node:fs";
import path from "node:path";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, once: false, now: null, configPath: "./config.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--once") args.once = true;
    else if (token === "--now") args.now = argv[++i];
    else if (token === "--config") args.configPath = argv[++i];
    else if (token === "--help" || token === "-h") args.help = true;
  }
  return args;
}

export function loadConfig(configPath, options = {}) {
  const resolved = path.resolve(process.cwd(), configPath || "./config.json");
  if (!fs.existsSync(resolved)) {
    throw new Error(`找不到配置文件：${resolved}。请复制 config.example.json 为 config.json 并填写 studentId。`);
  }
  const config = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const rootDir = path.dirname(resolved);
  const studentId = String(config.studentId || "").trim();
  if (!options.skipStudentIdValidation && (!studentId || studentId === "在这里填写你的学号" || studentId === "你的学号")) {
    throw new Error("请先在 config.json 中填写 studentId。独立直连 iclass 至少需要学号。 ");
  }
  if (!studentId) config.studentId = "DRY_RUN_STUDENT_ID";
  const password = String(config.password || "");
  const iclassLoginName = String(config.iclassLoginName || "").trim();
  if (!options.skipCredentialValidation && !password && !iclassLoginName) {
    throw new Error("请先运行 npm run setup，填写统一认证密码。旧配置也可继续使用 iclassLoginName。");
  }
  return normalizeConfig(config, rootDir);
}

function normalizeConfig(config, rootDir) {
  return {
    rootDir,
    studentId: String(config.studentId).trim(),
    password: String(config.password || ""),
    iclassLoginName: String(config.iclassLoginName || "").trim(),
    triggerMinutesBeforeClass: numberOr(config.triggerMinutesBeforeClass, 5),
    pollIntervalSeconds: numberOr(config.pollIntervalSeconds, 20),
    remoteRefreshSeconds: numberOr(config.remoteRefreshSeconds, 15 * 60),
    mode: String(config.mode || "auto"),
    allowInsecureTls: Boolean(config.allowInsecureTls ?? false),
    writeLogs: Boolean(config.writeLogs ?? true),
    logFile: path.resolve(rootDir, config.logFile || "./logs/assistant.log"),
    stateFile: path.resolve(rootDir, config.stateFile || "./state/handled.json"),
  };
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function helpText() {
  return `北航 iClass 签到助手\n\n用法：\n  npm run setup     首次配置学号和统一认证密码\n  npm start         自动获取课表并在签到窗口提交\n  npm run signin    手动选择今天的课堂签到\n  npm run dry-run   获取课表但不签到\n\n参数：\n  --config <path>  配置文件，默认 ./config.json\n  --dry-run        查询 iClass 远程课表并检查触发点，但不提交签到\n  --once           只执行一次检查后退出\n  --now <iso>      用指定时间模拟当前时间\n`;
}
