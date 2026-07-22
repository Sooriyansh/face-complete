const fs = require('fs');
const path = require('path');
const config = require('./config');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadState() {
  return readJson(config.stateFile, {
    eventLogRecords: {},
    processes: {},
    activeWindow: null,
    networkOnline: null,
    internetConnected: null,
    idle: false,
    lastSleepAt: null,
    sessionStartedAt: new Date().toISOString(),
  });
}

function saveState(state) {
  writeJson(config.stateFile, state);
}

module.exports = { loadState, saveState };
