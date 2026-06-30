const config = require('./config');
const logger = require('./logger');
const { loadState, saveState } = require('./state');
const { syncEvents } = require('./sync');
const {
  baseEvent,
  collectActiveWindow,
  collectEventLogEvents,
  collectInternet,
  collectIdle,
  collectNetwork,
  collectProcesses,
  collectSystemVitals,
} = require('./collectors');

const once = process.argv.includes('--once');
const state = loadState();

async function collectAll() {
  const groups = [];
  groups.push(collectNetwork(state));
  groups.push(await collectInternet(state));
  groups.push(collectSystemVitals(state));
  groups.push(await collectEventLogEvents(state));
  groups.push(await collectIdle(state));
  groups.push(await collectActiveWindow(state));
  groups.push(await collectProcesses(state));
  const events = groups.flat().filter(Boolean);
  saveState(state);
  return events;
}

async function tick() {
  try {
    const events = await collectAll();
    await syncEvents(events);
  } catch (error) {
    logger.error('Agent collection failed.', error);
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('The Windows activity agent must run on Windows.');
  }
  if (!config.collectorToken) {
    throw new Error('SYSTEM_EVENTS_COLLECTOR_TOKEN or FACEAI_COLLECTOR_TOKEN is required.');
  }

  await syncEvents([baseEvent('Agent Online', 'Windows activity agent started.', { status: 'Online', unique: `agent-online:${Date.now()}` })]);
  await tick();

  if (once) return;
  logger.info(`FaceAI Windows activity agent running every ${config.pollIntervalMs / 1000}s.`);
  setInterval(tick, config.pollIntervalMs);

  const stop = async () => {
    await syncEvents([baseEvent('Agent Offline', 'Windows activity agent stopped.', { status: 'Offline', unique: `agent-offline:${Date.now()}` })]).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  logger.error(error.message, error);
  process.exit(1);
});
