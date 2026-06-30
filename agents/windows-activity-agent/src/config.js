const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const originalEnvKeys = new Set(Object.keys(process.env));

function loadDotEnv(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    const canOverrideFileValue = options.override && value !== '' && !originalEnvKeys.has(key);
    if (key && (process.env[key] == null || canOverrideFileValue)) process.env[key] = value;
  });
}

loadDotEnv(path.join(__dirname, '..', '..', '..', '.env'));
loadDotEnv(path.join(__dirname, '..', '.env'), { override: true });

const dataDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'FaceAIActivityAgent');
const packageJson = require('../package.json');

function cleanConfigValue(value) {
  const normalized = String(value || '').trim();
  return /^<.*>$/.test(normalized) ? '' : normalized;
}

function envValue(...keys) {
  return keys.map((key) => cleanConfigValue(process.env[key])).find(Boolean) || '';
}

function currentUsername() {
  return envValue('USERNAME', 'USER', 'LOGNAME') || os.userInfo().username;
}

function inferServerUrl() {
  const explicitUrl = envValue(
    'FACEAI_SERVER_URL',
    'FACEAI_PUBLIC_URL',
    'PUBLIC_URL',
    'APP_URL',
    'BASE_URL',
    'RENDER_EXTERNAL_URL',
    'RAILWAY_PUBLIC_DOMAIN',
    'VERCEL_URL'
  );
  if (explicitUrl) {
    const url = /^https?:\/\//i.test(explicitUrl) ? explicitUrl : `https://${explicitUrl}`;
    return url.replace(/\/+$/, '');
  }

  const host = envValue('WEBSITE_HOSTNAME', 'RENDER_EXTERNAL_HOSTNAME');
  if (host) return `https://${host}`.replace(/\/+$/, '');

  const port = Number(envValue('PORT')) || 8080;
  return `http://localhost:${port}`;
}

function inferEmployeeId() {
  return envValue('FACEAI_EMPLOYEE_ID', 'EMPLOYEE_ID', 'USERPRINCIPALNAME', 'USERNAME', 'USER') || currentUsername();
}

function inferEmployeeName() {
  return envValue('FACEAI_EMPLOYEE_NAME', 'EMPLOYEE_NAME', 'FULLNAME', 'USER_FULL_NAME', 'USERNAME', 'USER') || currentUsername();
}

const username = currentUsername();
const hostname = os.hostname();

module.exports = {
  serverUrl: inferServerUrl(),
  collectorToken: envValue('SYSTEM_EVENTS_COLLECTOR_TOKEN', 'FACEAI_COLLECTOR_TOKEN'),
  employeeId: inferEmployeeId(),
  employeeName: inferEmployeeName(),
  agentId: envValue('FACEAI_AGENT_ID') || `${hostname}-${username}`,
  machineId: envValue('FACEAI_MACHINE_ID') || crypto.createHash('sha256').update(`${hostname}|${username}|${os.platform()}|${os.arch()}`).digest('hex').slice(0, 32),
  sessionId: envValue('FACEAI_SESSION_ID') || `${hostname}-${username}-${Date.now()}`,
  applicationVersion: packageJson.version || '1.0.0',
  operatingSystem: `${os.type()} ${os.release()} ${os.arch()}`,
  computer: hostname,
  pollIntervalMs: Math.max(Number(process.env.FACEAI_POLL_INTERVAL_SECONDS || 15), 5) * 1000,
  idleThresholdMs: Math.max(Number(process.env.FACEAI_IDLE_THRESHOLD_SECONDS || 120), 30) * 1000,
  eventLogLookback: Math.max(Number(process.env.FACEAI_EVENTLOG_LOOKBACK || 300), 50),
  dataDir,
  stateFile: path.join(dataDir, 'state.json'),
  queueFile: path.join(dataDir, 'offline-events.jsonl'),
  logFile: path.join(dataDir, 'agent.log'),
};
