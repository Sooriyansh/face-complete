const ActiveSession = require('../models/ActiveSession');
const ActivitySession = require('../models/ActivitySession');
const BrowserEvent = require('../models/BrowserEvent');
const IdleSession = require('../models/IdleSession');
const LoginHistory = require('../models/LoginHistory');
const NetworkEvent = require('../models/NetworkEvent');
const PowerEvent = require('../models/PowerEvent');
const TimelineLog = require('../models/TimelineLog');

function baseMirror(event) {
  return {
    employee: event.employee || null,
    employeeId: event.employeeId || '',
    sessionId: event.sessionId || event.metadata?.sessionId || '',
    machineId: event.machineId || event.metadata?.machineId || event.metadata?.agentId || '',
    hostname: event.hostname || event.computer || event.metadata?.hostname || '',
    operatingSystem: event.operatingSystem || event.metadata?.operatingSystem || '',
    applicationVersion: event.applicationVersion || event.metadata?.applicationVersion || '',
    browser: event.browser || event.metadata?.browser || '',
    ipAddress: event.ipAddress || event.metadata?.ipAddress || '',
    eventType: event.eventType || event.metadata?.eventType || 'system',
    eventName: event.eventName || event.event || 'Activity',
    status: event.status || 'Recorded',
    timestamp: event.occurredAt || new Date(),
    durationMs: Number(event.durationMs || 0),
    externalId: event.externalId,
    metadata: event.metadata || {},
  };
}

function mirrorTargets(event) {
  const name = event.event || event.eventName || '';
  const type = event.eventType || '';
  const targets = [TimelineLog];

  if (type === 'browser' || name === 'Website Visited') targets.push(BrowserEvent);
  if (type === 'network' || ['Network Online', 'Network Offline', 'Internet Connected', 'Internet Disconnected'].includes(name)) targets.push(NetworkEvent);
  if (type === 'power' || ['Startup', 'System Startup', 'Shutdown', 'System Shutdown', 'Unexpected Shutdown', 'Restart', 'System Restart', 'Sleep', 'Wake', 'Wakeup', 'System Wake', 'System Boot Time', 'System Uptime'].includes(name)) targets.push(PowerEvent);
  if (['Login', 'Logout', 'Windows Login', 'Windows Logout', 'Windows Sign In', 'Windows Sign Out', 'User Session Start', 'User Session End', 'Session Connect', 'Session Disconnect'].includes(name)) targets.push(LoginHistory, ActivitySession);
  if (['Idle Time', 'Idle State', 'Inactive Duration'].includes(name)) targets.push(IdleSession);
  if (['Active Usage', 'Active State', 'Active Application'].includes(name)) targets.push(ActiveSession);

  return [...new Set(targets)];
}

async function mirrorActivityEvent(event) {
  if (!event?.externalId) return;
  const base = baseMirror(event);
  await Promise.allSettled(mirrorTargets(event).map((Model) => {
    const update = { ...base };
    if (Model.modelName === 'TimelineLog') update.description = event.meaning || event.message || '';
    if (Model.modelName === 'BrowserEvent') {
      update.title = event.metadata?.websiteTitle || event.metadata?.windowTitle || '';
      update.processName = event.metadata?.processName || event.metadata?.browser || '';
      update.url = event.metadata?.url || '';
    }
    if (Model.modelName === 'NetworkEvent') {
      update.networkState = event.status || '';
      update.interfaces = Array.isArray(event.metadata?.interfaces) ? event.metadata.interfaces : [];
    }
    if (Model.modelName === 'PowerEvent') update.powerState = event.event || '';
    if (Model.modelName === 'LoginHistory') {
      update.accountName = event.user || event.employeeName || '';
      update.logonType = event.event || '';
    }
    return Model.updateOne({ externalId: event.externalId }, { $setOnInsert: update }, { upsert: true });
  }));
}

module.exports = { mirrorActivityEvent };
