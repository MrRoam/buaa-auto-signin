#!/usr/bin/env node
import { parseArgs, loadConfig, helpText } from "./config.mjs";
import { Logger } from "./logger.mjs";
import { HandledState } from "./state.mjs";
import { sleep } from "./time-utils.mjs";
import { IclassClient } from "./iclass-client.mjs";
import { nextRemoteClassTrigger, summarizeRemoteClass } from "./remote-schedule-source.mjs";
import { checkOnce as checkRemoteOnce } from "./signin-runner.mjs";
import { assertSupportedNode } from "./runtime.mjs";

assertSupportedNode();

const MAX_SCHEDULE_SLEEP_MS = 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_SLEEP_MS = 1000;

const args = parseArgs();
if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const config = loadConfig(args.configPath);
const logger = new Logger(config);
const state = new HandledState(config.stateFile);
const client = new IclassClient({
  studentId: config.studentId,
  password: config.password,
  iclassLoginName: config.iclassLoginName,
  logger,
});

logger.info("独立 iclass 远程课表签到助手已启动", {
  triggerMinutesBeforeClass: config.triggerMinutesBeforeClass,
  pollIntervalSeconds: config.pollIntervalSeconds,
  remoteRefreshSeconds: config.remoteRefreshSeconds,
  dryRun: args.dryRun,
  mode: config.mode,
});

if (config.mode !== "auto" && !args.dryRun) {
  throw new Error("后台运行需要 mode=auto；手动签到请运行 npm run signin。");
}

if (args.once || args.dryRun) {
  const now = args.now ? new Date(args.now) : new Date();
  await checkOnce(now);
} else {
  await runScheduled();
}

async function runScheduled() {
  while (true) {
    const now = new Date();
    const result = await checkOnce(now);

    if (result.fetchFailed || result.unhandledDue.length) {
      const retryMs = Math.max(MIN_SCHEDULE_SLEEP_MS, Math.max(5, config.pollIntervalSeconds) * 1000);
      logger.info("远程课表检查未完成，稍后重试。", {
        retryInSeconds: Math.round(retryMs / 1000),
        classes: result.unhandledDue.map(summarizeRemoteClass),
      });
      await sleep(retryMs);
      continue;
    }

    const next = nextRemoteClassTrigger(result.remoteClasses, new Date(), config.triggerMinutesBeforeClass);
    if (!next) {
      const refreshMs = clampSleep(Math.max(60, config.remoteRefreshSeconds) * 1000);
      logger.info("今天暂无未来远程课表触发点，稍后重新查询 iclass。", {
        retryInSeconds: Math.round(refreshMs / 1000),
      });
      await sleep(refreshMs);
      continue;
    }

    const delayMs = clampSleep(next.triggerAtDate.getTime() - Date.now());
    logger.info("下一个远程课表触发点已设置。", {
      triggerAt: next.triggerAtText,
      waitSeconds: Math.round(delayMs / 1000),
      class: summarizeRemoteClass(next),
    });
    await sleep(delayMs);
  }
}

async function checkOnce(now) {
  if (!Number.isFinite(now.getTime())) throw new Error(`无效 --now 时间：${args.now}`);
  return checkRemoteOnce({ now, config, client, state, logger, dryRun: args.dryRun });
}

function clampSleep(ms) {
  if (!Number.isFinite(ms)) return MAX_SCHEDULE_SLEEP_MS;
  return Math.min(MAX_SCHEDULE_SLEEP_MS, Math.max(MIN_SCHEDULE_SLEEP_MS, ms));
}
