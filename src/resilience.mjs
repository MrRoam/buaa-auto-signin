// 进程内自愈：让常驻调度循环在遇到意外错误时继续存活并退避重试，
// 从而不再依赖“每 30 分钟跑一次的隐藏终端健康检查”来把进程拉回来。

export const DEFAULT_ERROR_BACKOFF = Object.freeze({
  baseMs: 5 * 1000,
  multiplier: 2,
  maxMs: 15 * 60 * 1000,
});

export function computeErrorBackoffMs(consecutiveErrors, options = {}) {
  const { baseMs, multiplier, maxMs } = { ...DEFAULT_ERROR_BACKOFF, ...options };
  const attempt = Math.max(1, Math.floor(Number(consecutiveErrors) || 1));
  const raw = baseMs * Math.pow(multiplier, attempt - 1);
  if (!Number.isFinite(raw)) return maxMs;
  return Math.min(maxMs, Math.max(0, raw));
}

// 反复执行一次“调度步进”。单步抛错不会终止进程：记录、退避、继续。
// 单步的契约：
//   { sleepMs }        -> 睡这么久，然后再次步进
//   { done: true, value } -> 正常结束循环
export async function runResilientLoop(step, { logger, sleep, backoff } = {}) {
  let consecutiveErrors = 0;

  for (;;) {
    let result;
    try {
      result = await step();
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      const delayMs = computeErrorBackoffMs(consecutiveErrors, backoff);
      if (logger) {
        logger.error("调度循环出现未预期错误，已保留进程并退避重试。", {
          message: error && error.message ? error.message : String(error),
          stack: error && error.stack ? String(error.stack).split("\n").slice(0, 5).join("\n") : undefined,
          consecutiveErrors,
          retryInSeconds: Math.round(delayMs / 1000),
        });
      }
      await sleep(delayMs);
      continue;
    }

    if (result && result.done) return result.value;
    const sleepMs = result ? result.sleepMs : undefined;
    if (Number.isFinite(sleepMs) && sleepMs > 0) await sleep(sleepMs);
  }
}

// 兜底：真正的致命错误不再静默消失。记录后以非零码退出，
// 让计划任务的 RestartCount / 登录触发把进程重新拉起。
export function installFatalErrorHandlers({ logger, exit } = {}) {
  const quit = typeof exit === "function" ? exit : (code) => process.exit(code);
  const handle = (kind) => (error) => {
    if (logger) {
      logger.error(`进程遇到致命的 ${kind}，即将退出以便由计划任务重新拉起。`, {
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? String(error.stack) : undefined,
      });
    }
    quit(1);
  };

  process.on("uncaughtException", handle("uncaughtException"));
  process.on("unhandledRejection", handle("unhandledRejection"));
}
