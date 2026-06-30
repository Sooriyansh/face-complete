const fs = require('fs');
const os = require('os');
const path = require('path');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  });
}

loadDotEnv(path.join(__dirname, '..', '..', '..', '.env'));
loadDotEnv(path.join(__dirname, '..', '.env'));

const dataDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'FaceAIActivityAgent');

function cleanConfigValue(value) {
  const normalized = String(value || '').trim();
  return /^<.*>$/.test(normalized) ? '' : normalized;
}

module.exports = {
  serverUrl: (process.env.FACEAI_SERVER_URL || 'http://localhost:8080').replace(/\/+$/, ''),
  collectorToken: process.env.SYSTEM_EVENTS_COLLECTOR_TOKEN || process.env.FACEAI_COLLECTOR_TOKEN || '',
  employeeId: cleanConfigValue(process.env.FACEAI_EMPLOYEE_ID || process.env.EMPLOYEE_ID),
  employeeName: cleanConfigValue(process.env.FACEAI_EMPLOYEE_NAME || process.env.EMPLOYEE_NAME),
  agentId: process.env.FACEAI_AGENT_ID || `${os.hostname()}-${os.userInfo().username}`,
  computer: os.hostname(),
  pollIntervalMs: Math.max(Number(process.env.FACEAI_POLL_INTERVAL_SECONDS || 15), 5) * 1000,
  idleThresholdMs: Math.max(Number(process.env.FACEAI_IDLE_THRESHOLD_SECONDS || 120), 30) * 1000,
  eventLogLookback: Math.max(Number(process.env.FACEAI_EVENTLOG_LOOKBACK || 300), 50),
  dataDir,
  stateFile: path.join(dataDir, 'state.json'),
  queueFile: path.join(dataDir, 'offline-events.jsonl'),
  logFile: path.join(dataDir, 'agent.log'),
};
