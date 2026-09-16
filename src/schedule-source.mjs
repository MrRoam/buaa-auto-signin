import fs from "node:fs";
import vm from "node:vm";

export function loadSchedule(file) {
  const raw = fs.readFileSync(file, "utf8");
  let data;
  if (file.endsWith(".js")) {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(raw, sandbox, { filename: file });
    data = sandbox.window.MENTORCLAW_SCHEDULE_DATA;
  } else {
    data = JSON.parse(raw);
  }
  if (!data || !Array.isArray(data.items)) {
    throw new Error("课表文件格式不正确：需要包含 items 数组。 ");
  }
  return data;
}

export function upcomingClassTriggers(schedule, now, minutesBefore) {
  const nowMs = now.getTime();
  const triggerMs = minutesBefore * 60 * 1000;
  return schedule.items
    .filter((item) => item.type === "class" && !item.isHidden)
    .map(normalizeItem)
    .filter((item) => item.startAtDate && item.endAtDate)
    .filter((item) => {
      const delta = item.startAtDate.getTime() - nowMs;
      return delta >= 0 && delta <= triggerMs;
    })
    .sort((a, b) => a.startAtDate - b.startAtDate);
}

export function dueClassTriggers(schedule, now, minutesBefore) {
  const nowMs = now.getTime();
  return schedulableClasses(schedule, minutesBefore)
    .filter((item) => item.triggerAtDate.getTime() <= nowMs && item.startAtDate.getTime() >= nowMs)
    .sort((a, b) => a.startAtDate - b.startAtDate);
}

export function nextClassTrigger(schedule, now, minutesBefore) {
  const nowMs = now.getTime();
  return schedulableClasses(schedule, minutesBefore)
    .filter((item) => item.triggerAtDate.getTime() > nowMs)
    .sort((a, b) => a.triggerAtDate - b.triggerAtDate)[0] || null;
}

export function todaysClasses(schedule, now) {
  const key = dateKeyInChina(now);
  return schedule.items
    .filter((item) => item.type === "class" && !item.isHidden)
    .map(normalizeItem)
    .filter((item) => item.startAtDate && dateKeyInChina(item.startAtDate) === key)
    .sort((a, b) => a.startAtDate - b.startAtDate);
}

function schedulableClasses(schedule, minutesBefore) {
  return schedule.items
    .filter((item) => item.type === "class" && !item.isHidden)
    .map(normalizeItem)
    .filter((item) => item.startAtDate && item.endAtDate)
    .map((item) => withTrigger(item, minutesBefore));
}

function withTrigger(item, minutesBefore) {
  const triggerAtDate = new Date(item.startAtDate.getTime() - minutesBefore * 60 * 1000);
  return {
    ...item,
    triggerAtDate,
    triggerAtText: formatChinaIso(triggerAtDate),
  };
}

function normalizeItem(item) {
  const start = item.manualStartAt || item.startAt || item.dueAt;
  const end = item.manualEndAt || item.endAt;
  return {
    ...item,
    title: item.manualTitle || item.title || "未命名课程",
    location: item.manualLocation || item.location || "",
    startAtText: start,
    endAtText: end,
    startAtDate: parseDate(start),
    endAtDate: parseDate(end),
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function dateStrYYYYMMDDInChina(date = new Date()) {
  const parts = chinaParts(date);
  return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

export function dateKeyInChina(date = new Date()) {
  const parts = chinaParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatChinaTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
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
  const parts = Object.fromEntries(
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
  return parts;
}
