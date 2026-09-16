import { formatChinaTime } from "./schedule-source.mjs";
import {
  dueRemoteClassTriggers,
  remoteStateKey,
  summarizeRemoteClass,
  todaysRemoteClasses,
} from "./remote-schedule-source.mjs";

export async function checkOnce({ now, config, client, state, logger, dryRun = false }) {
  if (!Number.isFinite(now.getTime())) throw new Error(`无效 --now 时间：${now}`);

  let remoteClasses;
  try {
    remoteClasses = await client.getClasses(now);
  } catch (error) {
    logger.error("访问 iclass 远程课表失败", { message: error.message });
    return { remoteClasses: [], due: [], unhandledDue: [], fetchFailed: true };
  }

  const today = todaysRemoteClasses(remoteClasses, now, config.triggerMinutesBeforeClass);
  const due = dueRemoteClassTriggers(remoteClasses, now, config.triggerMinutesBeforeClass);
  logger.info(`当前北京时间 ${formatChinaTime(now)}，iclass 远程课表 ${today.length} 节，触发 ${due.length} 节。`, today.map(summarizeRemoteClass));

  const unhandledDue = due.filter((remoteClass) => !state.has(remoteStateKey(remoteClass)));
  if (dryRun) {
    for (const item of unhandledDue) {
      logger.info("dry-run 触发远程课表检查", summarizeRemoteClass(item));
    }
    return { remoteClasses, due, unhandledDue, fetchFailed: false };
  }

  for (const remoteClass of unhandledDue) {
    const key = remoteStateKey(remoteClass);
    if (state.has(key)) {
      logger.info("已处理过，跳过", summarizeRemoteClass(remoteClass));
      continue;
    }

    if (remoteClass.signStatus === 1) {
      logger.info("iclass 显示已签到，标记完成", summarizeRemoteClass(remoteClass));
      state.mark(key, { result: "already_signed", remote: summarizeRemoteClass(remoteClass) });
      continue;
    }

    try {
      const result = await client.signIn(remoteClass.courseId);
      logger.info("签到提交结果", { success: result.success, message: result.message, remote: summarizeRemoteClass(remoteClass) });
      if (result.success) {
        state.mark(key, { result: "signed", message: result.message, remote: summarizeRemoteClass(remoteClass) });
      }
    } catch (error) {
      logger.error("签到提交失败", { message: error.message, remote: summarizeRemoteClass(remoteClass) });
    }
  }

  const remainingDue = due.filter((remoteClass) => !state.has(remoteStateKey(remoteClass)));
  return { remoteClasses, due, unhandledDue: remainingDue, fetchFailed: false };
}
