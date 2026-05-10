export function logInfo(event, details = {}) {
  console.info(JSON.stringify({ level: 'info', event, ...safeDetails(details) }));
}

export function logWarn(event, details = {}) {
  console.warn(JSON.stringify({ level: 'warn', event, ...safeDetails(details) }));
}

export function logError(event, error, details = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    message: error?.message || String(error),
    ...safeDetails(details)
  }));
}

function safeDetails(details) {
  const blocked = new Set(['authorization', 'token', 'password', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']);
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !blocked.has(key))
  );
}
