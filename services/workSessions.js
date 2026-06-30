const WorkSession = require('../models/WorkSession');
const DailyWorkReport = require('../models/DailyWorkReport');
const SystemEvent = require('../models/SystemEvent');
const Student = require('../models/Student');
const { serializeSessionEvent, serializeSystemEvent } = require('./activityHistory');
const { calculateSessionMetrics } = require('./hrms');
const { emitEmployeeEvent, emitRoleEvent, notifyAdmins } = require('./notifications');
const { calculateScheduleState, getWorkSchedule } = require('./workSchedule');

async function recordHrmsEvent(fields) {
  const event = await SystemEvent.create({
    eventId: Date.now() + Math.floor(Math.random() * 1000),
    sourceLog: 'HRMS',
    externalId: `hrms-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...fields,
  }).catch(() => null);

  if (event) {
    const payload = serializeSystemEvent(event);
    emitRoleEvent('admin', 'activity:event', payload);
    if (fields.employee) {
      await emitEmployeeEvent(fields.employee, 'system_event:new', payload).catch(() => {});
    }
  }
  return event;
}

const TRACKING_START_HOUR = 8;
const CHECKED_OUT_STATUSES = new Set(['checked_out']);

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getTrackingStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(TRACKING_START_HOUR, 0, 0, 0);
  return start;
}

function formatDeviceInfo(event = {}) {
  return [event.computer, event.provider, event.sourceLog].filter(Boolean).join(' / ');
}

function mapEventCategory(type) {
  if (['Attendance Started', 'Face Attendance Marked', 'Late Login', 'Early Logout', 'Check-Out Completed', 'Attendance Marked', 'Face Scan'].includes(type)) {
    return 'attendance';
  }

  if (
    [
      'App Opened',
      'App Closed',
      'Website Visited',
      'Active Window',
      'Keyboard Activity',
      'Mouse Activity',
      'Active Usage',
      'Active State',
      'Idle Time',
      'Idle State',
      'Inactive Duration',
    ].includes(type)
  ) {
    return 'productivity';
  }

  if (['Session Started', 'Session Incomplete', 'Session Closed', 'Join Work', 'Check Out', 'Overtime Started', 'Overtime Ended'].includes(type)) {
    return 'session';
  }

  return 'system';
}

function normalizeEventType(type) {
  const eventMap = {
    Startup: 'Laptop Startup',
    Shutdown: 'Shutdown',
    'Unexpected Shutdown': 'Abrupt Shutdown',
    Restart: 'Restart',
    Sleep: 'Sleep',
    Wakeup: 'Wake Up',
    Lock: 'Lock',
    Unlock: 'Unlock',
    Login: 'Windows Login',
    Logout: 'Windows Logout',
    'Display On': 'Display On',
    'Display Off': 'Display Off',
    'User Session Start': 'User Session Start',
    'User Session End': 'User Session End',
    'Session Connect': 'User Session Start',
    'Session Disconnect': 'User Session End',
  };

  return eventMap[type] || type || 'Activity';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveEmployee(rawEvent = {}) {
  const objectId = String(rawEvent.employee || rawEvent.metadata?.employeeId || '').trim();
  if (objectId.match(/^[a-f\d]{24}$/i)) {
    const employee = await Student.findById(objectId).lean();
    if (employee) return employee;
  }

  const candidates = [
    rawEvent.employeeId,
    rawEvent.metadata?.employeeCode,
    rawEvent.employeeName,
    rawEvent.metadata?.employeeName,
    rawEvent.user,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const candidate of candidates) {
    const userPart = candidate.includes('\\') ? candidate.split('\\').pop() : candidate;
    const emailCandidate = userPart.includes('@') ? userPart.toLowerCase() : '';
    const employee = await Student.findOne({
      $or: [
        { rollNumber: candidate },
        { rollNumber: userPart },
        ...(emailCandidate ? [{ email: emailCandidate }] : []),
        { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
        { name: new RegExp(escapeRegex(userPart.replace(/[._-]+/g, ' ')), 'i') },
      ],
    }).lean();
    if (employee) return employee;
  }

  return null;
}

function hasDuplicateSessionEvent(session, rawEvent, type, occurredAt) {
  const externalId = rawEvent.externalId || rawEvent.metadata?.externalId;
  if (externalId && (session.events || []).some((event) => event.metadata?.externalId === externalId)) {
    return true;
  }

  const occurredTime = occurredAt.getTime();
  return (session.events || []).some((event) => {
    const eventTime = event.occurredAt ? new Date(event.occurredAt).getTime() : 0;
    return event.type === type
      && Math.abs(eventTime - occurredTime) < 1000
      && (event.deviceInfo || '') === (rawEvent.deviceInfo || formatDeviceInfo(rawEvent));
  });
}

function calculateProductivityScore(session) {
  if (session.monitoringPermission === 'denied') {
    return 0;
  }

  const events = session.events || [];
  const productiveEvents = events.filter((event) => event.category === 'productivity' || event.category === 'system').length;
  const idleEvents = events.filter((event) => ['Idle Time', 'Inactive Duration', 'Sleep', 'Lock'].includes(event.type)).length;
  const score = Math.round(Math.min(100, Math.max(0, 72 + productiveEvents * 2 - idleEvents * 5)));
  return Number.isFinite(score) ? score : 0;
}

function deriveSessionStatus(session, now = new Date()) {
  if (!session) {
    return 'offline';
  }

  if (session.status === 'checked_out' || session.status === 'incomplete') {
    return session.status;
  }

  const lastActivityAt = session.lastActivityAt ? new Date(session.lastActivityAt) : null;
  if (!lastActivityAt) {
    return 'active';
  }

  const idleMinutes = (now.getTime() - lastActivityAt.getTime()) / 60000;
  if (idleMinutes >= 15) {
    return 'idle';
  }

  if (session.deviceState === 'Sleep') {
    return 'sleep';
  }

  return session.status === 'break' ? 'break' : 'active';
}

async function startSessionAfterAttendance({ employee, attendance, attendanceTime = new Date() }) {
  const dateKey = getDateKey(attendanceTime);
  const schedule = await getWorkSchedule();
  const scheduleState = calculateScheduleState(schedule, attendanceTime);
  const trackingStart = scheduleState.joinDeadline;
  const startedAt = attendanceTime > trackingStart ? attendanceTime : trackingStart;
  const isLate = scheduleState.lateMs > 0;

  const existing = await WorkSession.findOne({ employee: employee._id, dateKey });
  if (existing) {
    if (CHECKED_OUT_STATUSES.has(existing.status)) {
      return existing;
    }

    existing.attendance = attendance?._id || existing.attendance;
    existing.attendanceTime = attendanceTime;
    existing.startedAt = existing.startedAt || startedAt;
    existing.lateMs = existing.lateMs || scheduleState.lateMs;
    existing.lateByMinutes = existing.lateByMinutes || scheduleState.lateByMinutes;
    existing.lateStatus = existing.lateStatus || scheduleState.lateStatus;
    existing.standardShiftMs = scheduleState.standardShiftMs;
    existing.status = deriveSessionStatus(existing);
    existing.deviceState = existing.deviceState || 'Monitoring Active';
    existing.lastActivityAt = existing.lastActivityAt || attendanceTime;
    existing.events.push({
      type: 'Face Attendance Marked',
      category: 'attendance',
      message: 'Attendance verified by face recognition. Monitoring session remains active.',
      occurredAt: attendanceTime,
      deviceInfo: 'Face Recognition',
      metadata: { duplicate: true },
    });
    await existing.save();
    emitRoleEvent('admin', 'activity:event', serializeSessionEvent(existing, existing.events[existing.events.length - 1]));
    emitRoleEvent('admin', 'work_session:updated', existing);
    await emitEmployeeEvent(employee._id, 'activity:event', serializeSessionEvent(existing, existing.events[existing.events.length - 1])).catch(() => {});
    await emitEmployeeEvent(employee._id, 'work_session:updated', existing).catch(() => {});
    return existing;
  }

  const events = [
    {
      type: 'Attendance Started',
      category: 'attendance',
      message: 'Face attendance marked. Real-time activity monitoring is active.',
      occurredAt: attendanceTime,
      deviceInfo: 'Face Recognition',
    },
    {
      type: 'Session Started',
      category: 'session',
      message: `Tracking window opened at ${trackingStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      occurredAt: startedAt,
      deviceInfo: 'Smart Work Session',
    },
  ];

  if (isLate) {
    events.push({
      type: 'Late Login',
      category: 'attendance',
      message: `Attendance was marked ${scheduleState.lateByMinutes} minute(s) late.`,
      occurredAt: attendanceTime,
      deviceInfo: 'Attendance Policy',
    });
  }

  const session = await WorkSession.create({
    employee: employee._id,
    attendance: attendance?._id || null,
    dateKey,
    status: 'active',
    deviceState: 'Monitoring Active',
    monitoringPermission: 'pending',
    attendanceTime,
    startedAt,
    lastActivityAt: attendanceTime,
    lateMs: scheduleState.lateMs,
    lateByMinutes: scheduleState.lateByMinutes,
    lateStatus: scheduleState.lateStatus,
    standardShiftMs: scheduleState.standardShiftMs,
    productivityScore: 78,
    events,
  });
  const latestEvent = session.events[session.events.length - 1];
  emitRoleEvent('admin', 'activity:event', serializeSessionEvent({ ...session.toObject(), employee }, latestEvent));
  emitRoleEvent('admin', 'work_session:updated', session);
  await emitEmployeeEvent(employee._id, 'activity:event', serializeSessionEvent({ ...session.toObject(), employee }, latestEvent)).catch(() => {});
  await emitEmployeeEvent(employee._id, 'work_session:updated', session).catch(() => {});
  return session;
}

async function joinWorkSession({ employee, dailyPlan, joinedAt = new Date() }) {
  const cleanPlan = String(dailyPlan || '').trim();
  if (!cleanPlan) {
    const error = new Error('Please enter your work plan before starting the work session.');
    error.status = 400;
    throw error;
  }

  const dateKey = getDateKey(joinedAt);
  let session = await WorkSession.findOne({ employee: employee._id, dateKey });

  if (session && session.status === 'checked_out') {
    const error = new Error('Today\'s work session is already checked out.');
    error.status = 400;
    throw error;
  }

  if (!session) {
    session = new WorkSession({
      employee: employee._id,
      dateKey,
      status: 'active',
      deviceState: 'Active',
      monitoringPermission: 'allowed',
      startedAt: joinedAt,
      lastActivityAt: joinedAt,
      productivityScore: 78,
      events: [],
    });
  }

  session.dailyPlan = cleanPlan;
  session.startedAt = session.startedAt || joinedAt;
  session.lastActivityAt = joinedAt;
  session.status = 'active';
  session.deviceState = 'Active';
  session.events.push({
    type: 'Join Work',
    category: 'session',
    message: 'Work session started successfully.',
    occurredAt: joinedAt,
    deviceInfo: 'Employee Dashboard',
    metadata: { dailyPlan: cleanPlan },
  });

  await session.save();
  const joinPayload = serializeSessionEvent(session, session.events[session.events.length - 1]);
  emitRoleEvent('admin', 'activity:event', joinPayload);
  emitRoleEvent('admin', 'work_session:updated', session);
  await emitEmployeeEvent(employee._id, 'activity:event', joinPayload).catch(() => {});
  await emitEmployeeEvent(employee._id, 'work_session:updated', session).catch(() => {});
  await recordHrmsEvent({
    employee: employee._id,
    employeeId: employee.rollNumber || '',
    employeeName: employee.name,
    user: employee.name,
    event: 'Employee Joined Work',
    meaning: `${employee.name} started a work session.`,
    occurredAt: joinedAt,
    provider: 'HRMS',
  });
  return session;
}

async function recordTrackingEvent(rawEvent) {
  const occurredAt = rawEvent.occurredAt ? new Date(rawEvent.occurredAt) : new Date();
  const dateKey = getDateKey(occurredAt);
  const type = normalizeEventType(rawEvent.event || rawEvent.type);
  const resolvedEmployee = await resolveEmployee(rawEvent);
  const query = {
    dateKey,
    status: { $nin: ['checked_out'] },
  };

  if (resolvedEmployee) {
    query.employee = resolvedEmployee._id;
  } else if (rawEvent.employee) {
    query.employee = rawEvent.employee;
  } else {
    return null;
  }

  let session = await WorkSession.findOne(query).populate('employee');

  if (!session || !session.employee) {
    return null;
  }

  if (session.checkoutAt) {
    return null;
  }

  if (session.monitoringPermission === 'denied') {
    return null;
  }

  if (hasDuplicateSessionEvent(session, rawEvent, type, occurredAt)) {
    return session;
  }

  const isAbruptShutdown = ['Shutdown', 'Unexpected Shutdown', 'Abrupt Shutdown'].includes(rawEvent.event || type);
  const durationMs = Math.max(Number(rawEvent.durationMs || rawEvent.metadata?.durationMs || 0), 0);
  session.events.push({
    type,
    category: mapEventCategory(type),
    message: rawEvent.message || rawEvent.meaning || `${type} captured by the event collector.`,
    occurredAt,
    deviceInfo: rawEvent.deviceInfo || formatDeviceInfo(rawEvent),
    metadata: {
      ...(rawEvent.metadata || {}),
      eventId: rawEvent.eventId,
      sourceLog: rawEvent.sourceLog,
      externalId: rawEvent.externalId,
      durationMs,
      status: rawEvent.status,
    },
  });
  if (!['Idle Time', 'Idle State', 'Inactive Duration', 'Display Off', 'Sleep', 'Lock'].includes(type)) {
    session.lastActivityAt = occurredAt;
  }
  session.deviceState = ['Sleep', 'Lock', 'Display Off'].includes(type) ? type : isAbruptShutdown ? 'Offline' : 'Online';
  session.status = isAbruptShutdown
    ? 'incomplete'
    : ['Idle Time', 'Idle State', 'Inactive Duration', 'Display Off', 'Lock'].includes(type)
      ? 'idle'
      : type === 'Sleep'
        ? 'sleep'
        : 'active';
  session.incompleteReason = isAbruptShutdown ? 'Laptop shut down before checkout.' : session.incompleteReason;
  session.productivityScore = calculateProductivityScore(session);

  if (type === 'Idle Time') {
    session.idleMs += durationMs;
  }

  if (type === 'Active Usage') {
    session.activeMs += durationMs;
  }

  if (type === 'Idle State') {
    session.idleMs += durationMs;
  }

  if (type === 'Active State') {
    session.activeMs += durationMs;
  }

  if (type === 'Inactive Duration') {
    session.inactiveMs += durationMs;
    session.idleMs += durationMs;
  }

  if (type === 'Sleep') {
    session.sleepMs += durationMs;
  }

  await session.save();
  const activityPayload = serializeSessionEvent(session, session.events[session.events.length - 1]);

  // Create a SystemEvent in the background for key employee activities so they appear in the Activity History timeline
  const systemEventsToSync = {
    'Lock': { name: 'Lock', meaning: 'Screen lock', id: 4800, log: 'Security', prov: 'BrowserActivity' },
    'Unlock': { name: 'Unlock', meaning: 'Screen unlock', id: 4801, log: 'Security', prov: 'BrowserActivity' },
    'Sleep': { name: 'Sleep', meaning: 'Sleep mode', id: 42, log: 'System', prov: 'BrowserActivity' },
    'Wake Up': { name: 'Wakeup', meaning: 'Sleep se wapas ON', id: 1, log: 'System', prov: 'BrowserActivity' },
    'Windows Login': { name: 'Login', meaning: 'User login', id: 4624, log: 'Security', prov: 'BrowserActivity' },
    'Windows Logout': { name: 'Logout', meaning: 'User logout', id: 4634, log: 'Security', prov: 'BrowserActivity' }
  };

  const sysConfig = systemEventsToSync[type];
  if (sysConfig && resolvedEmployee) {
    const millis = occurredAt.getTime();
    SystemEvent.create({
      event: sysConfig.name,
      meaning: sysConfig.meaning,
      occurredAt,
      eventId: sysConfig.id,
      sourceLog: sysConfig.log,
      provider: sysConfig.prov,
      computer: rawEvent.deviceInfo || formatDeviceInfo(rawEvent) || 'Browser workstation',
      employee: resolvedEmployee._id,
      employeeId: resolvedEmployee.rollNumber || '',
      employeeName: resolvedEmployee.name || '',
      user: resolvedEmployee.name || '',
      externalId: `browser-${sysConfig.name.toLowerCase()}-${resolvedEmployee._id}-${millis}-${Math.floor(Math.random() * 1000)}`,
      message: rawEvent.message || sysConfig.meaning,
    }).then(async (doc) => {
      const payload = serializeSystemEvent(doc);
      emitRoleEvent('admin', 'activity:event', payload);
      await emitEmployeeEvent(resolvedEmployee._id, 'system_event:new', payload).catch(() => {});
    }).catch(err => console.error('Error auto-creating SystemEvent from work session activity:', err));
  }

  if (resolvedEmployee) {
    emitRoleEvent('admin', 'activity:event', activityPayload);
    emitRoleEvent('admin', 'work_session:updated', session);
    await emitEmployeeEvent(resolvedEmployee._id, 'activity:event', activityPayload).catch(() => {});
    await emitEmployeeEvent(resolvedEmployee._id, 'work_session:updated', session).catch(() => {});
  }

  return session;
}

async function setMonitoringPermission(sessionId, permission) {
  const normalized = permission === 'allowed' ? 'allowed' : 'denied';
  const session = await WorkSession.findById(sessionId);
  if (!session) {
    const error = new Error('Work session was not found.');
    error.status = 404;
    throw error;
  }

  session.monitoringPermission = normalized;
  session.deviceState = normalized === 'allowed' ? 'Monitoring Active' : 'Monitoring Permission Denied';
  session.events.push({
    type: normalized === 'allowed' ? 'Monitoring Permission Allowed' : 'Monitoring Permission Denied',
    category: 'session',
    message:
      normalized === 'allowed'
        ? 'Employee allowed device activity monitoring during work sessions.'
        : 'Employee denied device activity monitoring. Attendance remains available.',
    occurredAt: new Date(),
    deviceInfo: 'Employee Dashboard',
  });
  await session.save();
  const permissionPayload = serializeSessionEvent(session, session.events[session.events.length - 1]);
  emitRoleEvent('admin', 'activity:event', permissionPayload);
  emitRoleEvent('admin', 'work_session:updated', session);
  await emitEmployeeEvent(session.employee, 'activity:event', permissionPayload).catch(() => {});
  await emitEmployeeEvent(session.employee, 'work_session:updated', session).catch(() => {});
  return session;
}

async function checkoutSession(sessionId, reportInput = {}) {
  const report = typeof reportInput === 'string' ? { workSummary: reportInput } : reportInput || {};
  const cleanSummary = String(report.workSummary || report.note || '').trim();
  const taskStatus = ['Completed', 'Partially Completed', 'Pending'].includes(report.taskStatus)
    ? report.taskStatus
    : 'Pending';
  const completedTasks = Array.isArray(report.completedTasks)
    ? report.completedTasks.map((task) => String(task || '').trim()).filter(Boolean)
    : [];
  const pendingTasks = String(report.pendingTasks || report.pendingWork || '').trim();
  const tomorrowPlan = String(report.tomorrowPlan || report.dailyPlan || 'Review pending work and continue planned tasks.').trim();
  const additionalNotes = String(report.additionalNotes || '').trim();

  if (!cleanSummary || !pendingTasks) {
    const error = new Error('Please complete the work summary and pending work before checkout.');
    error.status = 400;
    throw error;
  }

  const session = await WorkSession.findById(sessionId).populate('employee');
  if (!session) {
    const error = new Error('Work session was not found.');
    error.status = 404;
    throw error;
  }

  if (session.status === 'checked_out') {
    return session;
  }

  const now = new Date();
  const schedule = await getWorkSchedule();
  const metrics = calculateSessionMetrics(session, now, schedule);
  const scheduleState = calculateScheduleState(schedule, session.startedAt || session.attendanceTime || now, now);
  session.status = 'checked_out';
  session.deviceState = 'Checked Out';
  session.checkoutAt = now;
  session.checkoutNote = cleanSummary;
  session.taskStatus = taskStatus;
  session.workSummary = cleanSummary;
  session.pendingWork = pendingTasks;
  session.additionalNotes = additionalNotes;
  session.totalWorkingMs = metrics.totalWorkingMs;
  session.overtimeMs = metrics.overtimeMs;
  session.lateMs = session.lateMs || scheduleState.lateMs;
  session.lateByMinutes = session.lateByMinutes || scheduleState.lateByMinutes;
  session.lateStatus = session.lateStatus || scheduleState.lateStatus;
  session.weekendMs = metrics.weekendMs;
  session.holidayMs = metrics.holidayMs;
  session.standardShiftMs = metrics.standardShiftMs;
  session.productivityScore = calculateProductivityScore(session);
  session.events.push({
    type: 'Check-Out Completed',
    category: 'attendance',
    message: cleanSummary,
    occurredAt: now,
    deviceInfo: 'Employee Dashboard',
  });
  session.events.push({
    type: 'Session Closed',
    category: 'session',
    message: 'Monitoring stopped for the remaining day.',
    occurredAt: now,
    deviceInfo: 'Smart Work Session',
  });

  await session.save();
  const checkoutPayload = serializeSessionEvent(session, session.events[session.events.length - 1]);
  emitRoleEvent('admin', 'activity:event', checkoutPayload);
  emitRoleEvent('admin', 'work_session:updated', session);
  await emitEmployeeEvent(session.employee?._id || session.employee, 'activity:event', checkoutPayload).catch(() => {});
  await emitEmployeeEvent(session.employee?._id || session.employee, 'work_session:updated', session).catch(() => {});
  await DailyWorkReport.findOneAndUpdate(
    { employee: session.employee._id || session.employee, reportDate: session.dateKey },
    {
      employee: session.employee._id || session.employee,
      workSession: session._id,
      attendance: session.attendance || null,
      reportDate: session.dateKey,
      joinTime: session.startedAt || session.attendanceTime || null,
      dailyPlan: session.dailyPlan || '',
      taskStatus,
      workSummary: cleanSummary,
      completedTasks,
      pendingTasks,
      tomorrowPlan,
      additionalNotes,
      checkoutTime: now,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  if (session.attendance) {
    await require('../models/Attendance').findByIdAndUpdate(session.attendance, {
      checkOutTime: now,
      overtimeMinutes: Math.round(metrics.overtimeMs / 60000),
      lateByMinutes: session.lateByMinutes,
      lateStatus: session.lateStatus,
      attendanceStatus: session.lateStatus === 'Late' ? 'Present - Late' : 'Present',
    }).catch(() => {});
  }

  await recordHrmsEvent({
    employee: session.employee?._id || session.employee,
    employeeId: session.employee?.rollNumber || '',
    employeeName: session.employee?.name || 'Employee',
    user: session.employee?.name || 'Employee',
    event: metrics.overtimeMs > 0 ? 'Employee Worked Overtime' : 'Daily Report Submitted',
    meaning:
      metrics.overtimeMs > 0
        ? `Daily report submitted with ${Math.round(metrics.overtimeMs / 60000)} overtime minute(s).`
        : 'Daily work report submitted and checkout completed.',
    occurredAt: now,
    provider: 'HRMS',
  });
  await notifyAdmins({
    senderId: session.employee?._id || null,
    senderModel: 'Student',
    senderRole: 'employee',
    title: 'Daily Report Submitted',
    message: "Employee submitted today's work report.",
    type: 'Daily Report',
    priority: 'normal',
    actionUrl: '/daily-reports',
    metadata: { sessionId: session._id, employeeId: session.employee?._id || session.employee },
  });
  await notifyAdmins({
    senderId: session.employee?._id || null,
    senderModel: 'Student',
    senderRole: 'employee',
    title: 'Employee Checked Out',
    message: 'Work session completed successfully.',
    type: 'Checkout',
    priority: 'normal',
    actionUrl: '/daily-reports',
    metadata: { sessionId: session._id, employeeId: session.employee?._id || session.employee },
  });

  if (metrics.overtimeMs > 0) {
    await notifyAdmins({
      senderId: session.employee?._id || null,
      senderModel: 'Student',
      senderRole: 'employee',
      title: 'Overtime Detected',
      message: 'Employee exceeded standard working hours.',
      type: 'Overtime',
      priority: 'high',
      actionUrl: '/overtime-dashboard',
      metadata: {
        sessionId: session._id,
        employeeId: session.employee?._id || session.employee,
        overtimeMs: metrics.overtimeMs,
      },
    });
  }

  return session;
}

module.exports = {
  calculateProductivityScore,
  checkoutSession,
  deriveSessionStatus,
  getDateKey,
  joinWorkSession,
  recordTrackingEvent,
  setMonitoringPermission,
  startSessionAfterAttendance,
};
