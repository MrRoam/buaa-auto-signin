export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function minutesBetweenClockAndDate(clock, date) {
  const [h, m] = parseClock(clock);
  if (h == null || !date) return Number.POSITIVE_INFINITY;
  const expected = new Date(date);
  expected.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), 0, 0);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return (h * 60 + m) - (parts.hour * 60 + parts.minute);
}

function parseClock(value) {
  const match = String(value || "").match(/(\d{1,2})[:：](\d{2})/);
  if (!match) return [null, null];
  return [Number(match[1]), Number(match[2])];
}
