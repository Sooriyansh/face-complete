const Student = require('../models/Student');
const SystemEvent = require('../models/SystemEvent');
const WorkSession = require('../models/WorkSession');

const LOGIN_EVENTS = ['Login', 'Windows Login', 'Windows Sign In', 'Face Login', 'Password Login', 'Employee Login', 'User Session Start', 'Session Connect'];
const LOGOUT_EVENTS = ['Logout', 'Windows Logout', 'Windows Sign Out', 'Employee Logout', 'User Session End', 'Session Disconnect'];
const SLEEP_WAKE_EVENTS = ['Sleep', 'Wakeup', 'Wake Up', 'System Wake'];
const POWER_EVENTS = ['Startup', 'System Startup', 'Laptop Startup', 'Shutdown', 'System Shutdown', 'Unexpected Shutdown', 'Abrupt Shutdown', 'Restart', 'System Restart'];
const TRACKED_ACTIVITY_EVENTS = new Set([...LOGIN_EVENTS, ...LOGOUT_EVENTS, ...SLEEP_WAKE_EVENTS, ...POWER_EVENTS]);

function compactOrQuery(clauses) {
  return clauses.filter((clause) => {
    const value = Object.values(clause)[0];
    return value !== '' && value != null;
  });
}

function buildEmployeeEventQuery(employee) {
  if (!employee) return { _id: null };
  const clauses = compactOrQuery([
    { employee: employee._id },
    { employeeId: employee.rollNumber || '' },
    { employeeName: employee.name || '' },
    { user: employee.name || '' },
    { user: employee.email || '' },
  ]);
  return clauses.length ? { $or: clauses } : { _id: null };
}

function eventMatches(eventName, names) {
  const normalized = String(eventName || '').toLowerCase();
  return names.some((name) => normalized === String(name).toLowerCase());
}

function serializeSystemEvent(event = {}) {
  const employee = event.employee && typeof event.employee === 'object' ? event.employee : null;
  return {
    _id: event._id,
    event: event.event || event.type || 'Activity',
    meaning: event.meaning || event.message || '',
    description: event.meaning || event.message || event.provider || event.sourceLog || '',
    occurredAt: event.occurredAt || event.createdAt || new Date(),
    eventId: event.eventId || 0,
    sourceLog: event.sourceLog || '',
    provider: event.provider || '',
    computer: event.computer || event.deviceName || '',
    hostname: event.hostname || event.computer || event.deviceName || '',
    machineId: event.machineId || event.metadata?.machineId || event.metadata?.agentId || '',
    operatingSystem: event.operatingSystem || event.metadata?.operatingSystem || '',
    applicationVersion: event.applicationVersion || event.metadata?.applicationVersion || '',
    browser: event.browser || event.metadata?.browser || '',
    deviceName: event.computer || event.deviceName || '',
    ipAddress: event.ipAddress || event.metadata?.ipAddress || '',
    employee: employee?._id || event.employee || null,
    employeeId: event.employeeId || employee?.rollNumber || '',
    employeeName: event.employeeName || employee?.name || event.user || 'Unknown',
    department: event.department || employee?.department || event.metadata?.department || '',
    role: event.role || event.metadata?.role || 'employee',
    user: event.user || event.employeeName || employee?.name || '',
    durationMs: Number(event.durationMs || 0),
    sessionId: event.sessionId || event.metadata?.sessionId || '',
    status: event.status || 'Recorded',
    eventType: event.eventType || event.metadata?.eventType || 'system',
    eventName: event.eventName || event.event || event.type || 'Activity',
    metadata: event.metadata || {},
    externalId: event.externalId || String(event._id || ''),
  };
}

function serializeSessionEvent(session, event = {}) {
  const employee = session.employee && typeof session.employee === 'object' ? session.employee : {};
  return serializeSystemEvent({
    _id: `${session._id}:${event.type}:${new Date(event.occurredAt || session.updatedAt).getTime()}`,
    event: event.type || 'Activity',
    meaning: event.message || event.category || '',
    occurredAt: event.occurredAt || session.updatedAt,
    eventId: event.metadata?.eventId || 0,
    sourceLog: event.deviceInfo || 'WorkSession',
    provider: event.category || 'session',
    computer: event.deviceInfo || '',
    employee: employee._id || session.employee,
    employeeId: employee.rollNumber || '',
    employeeName: employee.name || '',
    department: employee.department || '',
    role: 'employee',
    durationMs: event.metadata?.durationMs || 0,
    sessionId: String(session._id),
    status: event.metadata?.status || session.status || 'Recorded',
    externalId: event.metadata?.externalId || `${session._id}:${event.type}:${new Date(event.occurredAt || session.updatedAt).getTime()}`,
  });
}

function sessionEventFilter({ from, to, selectedEmployee, selectedDepartment }) {
  return (event) => {
    const time = new Date(event.occurredAt).getTime();
    return (!from || time >= from.getTime())
      && (!to || time <= to.getTime())
      && (!selectedEmployee || String(event.employee) === String(selectedEmployee))
      && (!selectedDepartment || event.department === selectedDepartment);
  };
}

async function getActivityHistory({
  query = {},
  limit = 100,
  sortDirection = -1,
  from = null,
  to = null,
  selectedEmployee = '',
  selectedDepartment = '',
  includeSessionEvents = true,
} = {}) {
  const scopedQuery = {
    ...query,
    event: query.event || { $in: [...TRACKED_ACTIVITY_EVENTS] },
  };
  const events = await SystemEvent.find(scopedQuery)
    .sort({ occurredAt: sortDirection })
    .limit(limit)
    .populate('employee')
    .lean();

  let sessionEvents = [];
  if (includeSessionEvents) {
    const sessionQuery = {};
    if (from || to) {
      const startKey = (from || new Date(0)).toISOString().slice(0, 10);
      const endKey = (to || new Date()).toISOString().slice(0, 10);
      sessionQuery.dateKey = { $gte: startKey, $lte: endKey };
    }
    if (selectedEmployee) sessionQuery.employee = selectedEmployee;

    const sessions = await WorkSession.find(sessionQuery)
      .sort({ dateKey: -1, updatedAt: -1 })
      .limit(300)
      .populate('employee')
      .lean();

    sessionEvents = sessions
      .flatMap((session) => (session.events || []).map((event) => serializeSessionEvent(session, event)))
      .filter((event) => TRACKED_ACTIVITY_EVENTS.has(event.event))
      .filter(sessionEventFilter({ from, to, selectedEmployee, selectedDepartment }));
  }

  const seen = new Set();
  return [...events.map(serializeSystemEvent), ...sessionEvents]
    .filter((event) => {
      const key = event.externalId || `${event.employee}:${event.event}:${new Date(event.occurredAt).getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => sortDirection === 1
      ? new Date(a.occurredAt) - new Date(b.occurredAt)
      : new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, limit);
}

async function getEmployeeActivitySummary(employee) {
  if (!employee) {
    return {
      loginCount: 0,
      logoutCount: 0,
      signInCount: 0,
      sleepWakeCount: 0,
      powerEventCount: 0,
      totalActivityCount: 0,
      activeMs: 0,
      idleMs: 0,
      sleepMs: 0,
    };
  }

  const eventQuery = buildEmployeeEventQuery(employee);
  const sessions = await WorkSession.find({ employee: employee._id }).select('events activeMs idleMs sleepMs').lean();
  const sessionEvents = sessions.flatMap((session) => session.events || []);
  const sessionCount = (names) => sessionEvents.filter((event) => eventMatches(event.type, names)).length;

  const [
    loginCount,
    logoutCount,
    sleepWakeCount,
    powerEventCount,
    totalSystemCount,
  ] = await Promise.all([
    SystemEvent.countDocuments({ ...eventQuery, event: { $in: LOGIN_EVENTS } }),
    SystemEvent.countDocuments({ ...eventQuery, event: { $in: LOGOUT_EVENTS } }),
    SystemEvent.countDocuments({ ...eventQuery, event: { $in: SLEEP_WAKE_EVENTS } }),
    SystemEvent.countDocuments({ ...eventQuery, event: { $in: POWER_EVENTS } }),
    SystemEvent.countDocuments({ ...eventQuery, event: { $in: [...TRACKED_ACTIVITY_EVENTS] } }),
  ]);

  const activeMs = sessions.reduce((sum, session) => sum + Number(session.activeMs || 0), 0);
  const idleMs = sessions.reduce((sum, session) => sum + Number(session.idleMs || 0), 0);
  const sleepMs = sessions.reduce((sum, session) => sum + Number(session.sleepMs || 0), 0);
  const totalSessionEvents = sessionEvents.filter((event) => TRACKED_ACTIVITY_EVENTS.has(event.type)).length;

  return {
    loginCount,
    logoutCount,
    signInCount: loginCount + logoutCount,
    sleepWakeCount: sleepWakeCount + sessionCount(SLEEP_WAKE_EVENTS),
    powerEventCount: powerEventCount + sessionCount(POWER_EVENTS),
    totalActivityCount: totalSystemCount + totalSessionEvents,
    activeMs,
    idleMs,
    sleepMs,
  };
}

async function findEmployeeForUser(user) {
  if (!user || user.role !== 'employee') return null;
  const clauses = compactOrQuery([
    { email: user.email || '' },
    { _id: user.employeeProfile || null },
    { rollNumber: user.employeeId || '' },
  ]);
  return clauses.length ? Student.findOne({ $or: clauses }).sort({ createdAt: -1 }) : null;
}

module.exports = {
  buildEmployeeEventQuery,
  compactOrQuery,
  getActivityHistory,
  getEmployeeActivitySummary,
  findEmployeeForUser,
  serializeSessionEvent,
  serializeSystemEvent,
};
