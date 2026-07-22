const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

let socket = null;
let socketReady = false;
let socketClientMissingLogged = false;

function getSocketClient() {
  try {
    return require('socket.io-client');
  } catch {
    return null;
  }
}

function uniqueEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = event.externalId || `${event.event}:${event.occurredAt}:${event.machineId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appendQueue(events) {
  if (!events.length) return;
  fs.mkdirSync(path.dirname(config.queueFile), { recursive: true });
  const existing = readQueue();
  const merged = uniqueEvents([...existing, ...events]).slice(-5000);
  fs.writeFileSync(config.queueFile, merged.map((event) => JSON.stringify(event)).join('\n') + '\n');
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

function ensureSocket() {
  if (socket || !config.collectorToken) return socket;
  const io = getSocketClient();
  if (!io) {
    if (!socketClientMissingLogged) {
      logger.warn('socket.io-client is not installed; REST sync remains active.');
      socketClientMissingLogged = true;
    }
    return null;
  }

  socket = io(config.serverUrl, {
    auth: {
      collectorToken: config.collectorToken,
      agentId: config.agentId,
      machineId: config.machineId,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('collector:ready', () => {
    socketReady = true;
    logger.info('Socket.IO collector channel connected.');
  });
  socket.on('disconnect', () => {
    socketReady = false;
  });
  socket.on('connect_error', (error) => {
    socketReady = false;
    logger.warn('Socket.IO collector channel unavailable.', error.message);
  });
  return socket;
}

async function emitSocketHeartbeat(events) {
  const client = ensureSocket();
  if (!client || !socketReady) return;
  await new Promise((resolve) => {
    client.timeout(5000).emit('collector:heartbeat', {
      id: `${config.agentId}:${Date.now()}`,
      agentId: config.agentId,
      machineId: config.machineId,
      eventCount: events.length,
      latestEventAt: events[events.length - 1]?.occurredAt || null,
      sentAt: new Date().toISOString(),
    }, (error) => {
      if (error) logger.warn('Socket.IO heartbeat was not acknowledged.', error.message);
      resolve();
    });
  });
}

async function syncEvents(events) {
  const queued = readQueue();
  const batch = uniqueEvents([...queued, ...events]);
  if (!batch.length) {
    await emitSocketHeartbeat([]);
    return;
  }
  try {
    const result = await postEvents(batch);
    await emitSocketHeartbeat(batch);
    clearQueue();
    logger.info(`Synced ${result.received || batch.length} event(s), inserted ${result.inserted || 0}.`);
  } catch (error) {
    appendQueue(events);
    logger.warn('Server unavailable. Events buffered locally.', error.message);
  }
}

module.exports = { syncEvents };
