export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export async function fetchTextWithTimeout(fetchImpl, input, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(input, { ...options, signal: options.signal || controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒）：${safeRequestUrl(input)}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function safeRequestUrl(input) {
  try {
    const url = new URL(String(input));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "未知地址";
  }
}
