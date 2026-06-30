const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

function appendQueue(events) {
  if (!events.length) return;
  fs.mkdirSync(path.dirname(config.queueFile), { recursive: true });
  fs.appendFileSync(config.queueFile, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
}

function readQueue() {
  if (!fs.existsSync(config.queueFile)) return [];
  return fs.readFileSync(config.queueFile, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function clearQueue() {
  if (fs.existsSync(config.queueFile)) fs.unlinkSync(config.queueFile);
}

async function postEvents(events) {
  if (!events.length) return { received: 0, inserted: 0 };
  const response = await fetch(`${config.serverUrl}/api/system-events/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-collector-token': config.collectorToken,
    },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Server rejected events with ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function syncEvents(events) {
  const queued = readQueue();
  const batch = [...queued, ...events];
  if (!batch.length) return;
  try {
    const result = await postEvents(batch);
    clearQueue();
    logger.info(`Synced ${result.received || batch.length} event(s), inserted ${result.inserted || 0}.`);
  } catch (error) {
    appendQueue(events);
    logger.warn('Server unavailable. Events buffered locally.', error.message);
  }
}

module.exports = { syncEvents };
