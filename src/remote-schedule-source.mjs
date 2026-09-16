export function dueRemoteClassTriggers(remoteClasses, now, minutesBefore) {
  const nowMs = now.getTime();
  return schedulableRemoteClasses(remoteClasses, now, minutesBefore)
    .filter((item) => item.triggerAtDate.getTime() <= nowMs && item.endAtDate.getTime() > nowMs)
    .sort((a, b) => a.startAtDate - b.startAtDate);
}

export function nextRemoteClassTrigger(remoteClasses, now, minutesBefore) {
  const nowMs = now.getTime();
  return schedulableRemoteClasses(remoteClasses, now, minutesBefore)
    .filter((item) => item.triggerAtDate.getTime() > nowMs)
    .sort((a, b) => a.triggerAtDate - b.triggerAtDate)[0] || null;
}

export function todaysRemoteClasses(remoteClasses, now, minutesBefore) {
  return schedulableRemoteClasses(remoteClasses, now, minutesBefore)
    .sort((a, b) => a.startAtDate - b.startAtDate);
}

export function remoteStateKey(item) {
  return `iclass:${dateStrYYYYMMDDInChina(item.startAtDate)}:${item.courseId}:${item.classBeginTime}`;
}

export function summarizeRemoteClass(item) {
  return {
    courseId: item.courseId,
    courseName: item.courseName,
    classBeginTime: item.classBeginTime,
    classEndTime: item.classEndTime,
    startAt: item.startAtText,
    endAt: item.endAtText,
    triggerAt: item.triggerAtText,
    signStatus: item.signStatus,
  };
}

function schedulableRemoteClasses(remoteClasses, baseDate, minutesBefore) {
  return remoteClasses
    .map((item) => normalizeRemoteClass(item, baseDate, minutesBefore))
    .filter(Boolean);
}

function normalizeRemoteClass(item, baseDate, minutesBefore) {
  const courseId = String(item.courseId || item.id || "").trim();
  const courseName = String(item.courseName || item.title || "未命名课程");
  const classBeginTime = String(item.classBeginTime || "").trim();
  const classEndTime = String(item.classEndTime || "").trim();
  const startAtDate = parseRemoteClassTime(classBeginTime, baseDate);
  const endAtDate = parseRemoteClassTime(classEndTime, baseDate);
  if (!courseId || !startAtDate || !endAtDate) return null;

  const normalizedEndAtDate = endAtDate < startAtDate
    ? new Date(endAtDate.getTime() + 24 * 60 * 60 * 1000)
    : endAtDate;
  const triggerAtDate = new Date(startAtDate.getTime() - minutesBefore * 60 * 1000);

  return {
    ...item,
    id: courseId,
    courseId,
    courseName,
    title: courseName,
    classBeginTime,
    classEndTime,
    signStatus: Number(item.signStatus || 0),
    startAtDate,
    endAtDate: normalizedEndAtDate,
    triggerAtDate,
    startAtText: formatChinaIso(startAtDate),
    endAtText: formatChinaIso(normalizedEndAtDate),
    triggerAtText: formatChinaIso(triggerAtDate),
  };
}

function parseRemoteClassTime(value, baseDate) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateTime = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2})[:：](\d{2})(?::(\d{2}))?/);
  if (dateTime) {
    return chinaDate(
      Number(dateTime[1]),
      Number(dateTime[2]),
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6] || 0),
    );
  }

  const clock = raw.match(/(\d{1,2})[:：](\d{2})(?::(\d{2}))?/);
  if (!clock) return null;
  const parts = chinaParts(baseDate);
  return chinaDate(parts.year, parts.month, parts.day, Number(clock[1]), Number(clock[2]), Number(clock[3] || 0));
}

function chinaDate(year, month, day, hour, minute, second) {
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.000+08:00`);
}

function dateStrYYYYMMDDInChina(date) {
  const parts = chinaParts(date);
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}`;
}

function formatChinaIso(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000+08:00`;
}

function chinaParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function pad(value) {
  return String(value).padStart(2, "0");
}
