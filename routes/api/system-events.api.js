const express = require('express');

const SystemEvent = require('../../models/SystemEvent');
const Student = require('../../models/Student');
const WorkSession = require('../../models/WorkSession');
const { serializeSystemEvent } = require('../../services/activityHistory');
const { rowsToCsv } = require('../../services/hrms');
const { emitEmployeeEvent, emitRoleEvent } = require('../../services/notifications');
const { recordTrackingEvent } = require('../../services/workSessions');

const router = express.Router();

function sendSystemEventsExport(res, type, rows) {
  const headers = [
    { label: 'Employee ID', value: (row) => row.employeeId || '-' },
    { label: 'Employee', value: (row) => row.employeeName || row.user || 'Unknown' },
    { label: 'Event', value: (row) => row.event },
    { label: 'Occurred At', value: (row) => new Date(row.occurredAt).toLocaleString() },
    { label: 'Meaning', value: (row) => row.meaning || row.message || '-' },
    { label: 'Source', value: (row) => row.sourceLog || row.provider || '-' },
    { label: 'Computer', value: (row) => row.computer || '-' },
    { label: 'Status', value: (row) => row.status || 'Recorded' },
    { label: 'Duration Ms', value: (row) => row.durationMs || 0 },
  ];

  if (type === 'pdf') {
    res.type('html');
    return res.send(`<!doctype html><html><head><title>System Event Logs</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef}</style></head><body><h1>System Event Logs</h1><table><thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${h.value(row)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.print()</script></body></html>`);
  }

  const extension = type === 'excel' ? 'xls' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="system-event-logs.${extension}"`);
  res.type(type === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  return res.send(rowsToCsv(rows, headers));
}

const ALLOWED_EVENTS = new Set([
  'Startup',
  'Shutdown',
  'Unexpected Shutdown',
  'Restart',
  'Sleep',
  'Wakeup',
  'System Wake',
  'Lock',
  'Unlock',
  'Screen Lock',
  'Screen Unlock',
  'Login',
  'Logout',
  'Windows Sign In',
  'Windows Sign Out',
  'Idle Time',
  'Idle State',
  'Active Usage',
  'Active State',
  'App Opened',
  'App Closed',
  'Application Started',
  'Application Stopped',
  'Application Switch',
  'Website Visited',
  'Active Window',
  'Active Application',
  'Keyboard Activity',
  'Mouse Activity',
  'Inactive Duration',
  'Display On',
  'Display Off',
  'User Session Start',
  'User Session End',
  'Session Connect',
  'Session Disconnect',
  'Network Online',
  'Network Offline',
  'System Boot Time',
  'System Uptime',
  'Agent Online',
  'Agent Offline',
]);

const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 17;

function getWorkdayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(WORKDAY_START_HOUR, 0, 0, 0);

  const end = new Date(now);
  end.setHours(WORKDAY_END_HOUR, 0, 0, 0);

  return {
    start,
    end: now < end ? now : end,
    fixedEnd: end,
  };
}

function parseDateQuery(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSystemEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  const event = String(rawEvent.event || '').trim();
  const occurredAt = new Date(rawEvent.occurredAt);
  const eventId = Number(rawEvent.eventId ?? 0);
  const sourceLog = String(rawEvent.sourceLog || '').trim();
  const externalId = String(rawEvent.externalId || '').trim();

  if (
    !ALLOWED_EVENTS.has(event) ||
    Number.isNaN(occurredAt.getTime()) ||
    !Number.isFinite(eventId) ||
    !sourceLog ||
    !externalId
  ) {
    return null;
  }

  return {
    event,
    meaning: String(rawEvent.meaning || '').trim().slice(0, 500),
    occurredAt,
    eventId,
    sourceLog,
    provider: String(rawEvent.provider || '').trim().slice(0, 200),
    recordNumber: Number.isFinite(Number(rawEvent.recordNumber)) ? Number(rawEvent.recordNumber) : null,
    computer: String(rawEvent.computer || '').trim().slice(0, 200),
    employee: String(rawEvent.employee || rawEvent.employeeObjectId || '').match(/^[a-f\d]{24}$/i)
      ? String(rawEvent.employee || rawEvent.employeeObjectId)
      : null,
    employeeId: String(rawEvent.employeeId || rawEvent.employeeCode || '').trim().slice(0, 120),
    employeeName: String(rawEvent.employeeName || '').trim().slice(0, 200),
    user: String(rawEvent.user || '').trim().slice(0, 200),
    durationMs: Math.max(Number(rawEvent.durationMs || rawEvent.duration || 0), 0),
    status: String(rawEvent.status || 'Recorded').trim().slice(0, 80),
    metadata: rawEvent.metadata && typeof rawEvent.metadata === 'object' ? rawEvent.metadata : {},
    message: String(rawEvent.message || '').trim().slice(0, 2000),
    externalId: externalId.slice(0, 500),
  };
}

function dateOnlyRange(value) {
  if (!value) return null;
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactOrQuery(clauses) {
  return clauses.filter((clause) => {
    const value = Object.values(clause)[0];
    return value !== '' && value != null;
  });
}

function parseEventFilter(value) {
  return String(value || '')
    .split(',')
    .map((event) => event.trim())
    .filter((event) => ALLOWED_EVENTS.has(event));
}

async function resolveEmployeeForEvent(event) {
  const employeeObjectId = String(event.employee || '').trim();
  if (employeeObjectId.match(/^[a-f\d]{24}$/i)) {
    const employee = await Student.findById(employeeObjectId).lean();
    if (employee) return employee;
  }

  const candidates = [
    event.employeeId,
    event.metadata?.employeeId,
    event.metadata?.employeeCode,
    event.employeeName,
    event.metadata?.employeeName,
    event.user,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const candidate of candidates) {
    const userPart = candidate.includes('\\') ? candidate.split('\\').pop() : candidate;
    const emailCandidate = userPart.includes('@') ? userPart.toLowerCase() : '';
    const exact = await Student.findOne({
      $or: [
        { rollNumber: candidate },
        { rollNumber: userPart },
        ...(emailCandidate ? [{ email: emailCandidate }] : []),
        { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
      ],
    }).lean();
    if (exact) return exact;

    const fuzzyName = userPart.replace(/[._-]+/g, ' ').trim();
    if (fuzzyName) {
      const fuzzy = await Student.findOne({ name: new RegExp(escapeRegex(fuzzyName), 'i') }).lean();
      if (fuzzy) return fuzzy;
    }
  }

  return null;
}

async function enrichEventsWithEmployees(events) {
  return Promise.all(events.map(async (event) => {
    const employee = await resolveEmployeeForEvent(event);
    if (!employee) return event;
    return {
      ...event,
      employee: employee._id,
      employeeId: event.employeeId || employee.rollNumber || '',
      employeeName: employee.name || event.employeeName || '',
      user: event.user || employee.name || '',
      metadata: {
        ...event.metadata,
        employeeId: String(employee._id),
        employeeName: employee.name,
        employeeCode: employee.rollNumber || '',
      },
    };
  }));
}

function getUpsertedOperationIndexes(result) {
  const indexes = new Set();
  const upsertedIds = result?.upsertedIds || {};
  Object.keys(upsertedIds).forEach((index) => indexes.add(Number(index)));

  const rawUpserted = result?.result?.upserted || result?.getRawResponse?.().upserted || [];
  rawUpserted.forEach((item) => {
    if (Number.isFinite(Number(item.index))) indexes.add(Number(item.index));
  });

  return [...indexes].filter((index) => Number.isInteger(index));
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const mode = String(req.query.mode || '').trim();
    const selectedUser = String(req.query.user || '').trim();
    const selectedEmployee = String(req.query.employee || '').trim();
    const selectedDepartment = String(req.query.department || '').trim();
    const selectedDate = String(req.query.date || '').trim();
    const selectedEvents = parseEventFilter(req.query.event);
    const workdayRange = getWorkdayRange();
    const dateRange = dateOnlyRange(selectedDate);
    const from = dateRange?.start || parseDateQuery(req.query.from) || (mode === 'workday' ? workdayRange.start : null);
    const to = dateRange?.end || parseDateQuery(req.query.to) || (mode === 'workday' ? workdayRange.end : null);
    const sortDirection = String(req.query.sort || '').toLowerCase() === 'asc' ? 1 : -1;

    const query = {};
    if (from || to) {
      query.occurredAt = {};
      if (from) {
        query.occurredAt.$gte = from;
      }
      if (to) {
        query.occurredAt.$lte = to;
      }
    }
    if (selectedDepartment) {
      const employees = await Student.find({ department: selectedDepartment }).select('_id rollNumber name').lean();
      query.$or = employees.flatMap((employee) => compactOrQuery([
        { employee: employee._id },
        { employeeId: employee.rollNumber || '' },
        { employeeName: employee.name || '' },
        { user: employee.name || '' },
      ]));
      if (!query.$or.length) query.$or = [{ user: /.^/ }];
    } else if (selectedEmployee || selectedUser) {
      const selected = selectedEmployee || selectedUser;
      const employee = selected.match(/^[a-f\d]{24}$/i) ? await Student.findById(selected).lean() : null;
      query.$or = employee
        ? compactOrQuery([{ employee: employee._id }, { employeeId: employee.rollNumber || '' }, { employeeName: employee.name || '' }, { user: employee.name || '' }])
        : compactOrQuery([{ user: selected }, { employeeName: selected }, { employeeId: selected }]);
    }
    if (selectedEvents.length) {
      query.event = { $in: selectedEvents };
    }

    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      query.$or = employee
        ? compactOrQuery([{ employee: employee._id }, { employeeId: employee.rollNumber || '' }, { employeeName: employee.name || '' }, { user: employee.name || '' }])
        : [{ user: /.^/ }];
    }

    const events = await SystemEvent.find(query)
      .sort({ occurredAt: sortDirection })
      .limit(limit)
      .lean();

    const sessionQuery = {};
    if (selectedDate) sessionQuery.dateKey = selectedDate;
    if (selectedEmployee?.match(/^[a-f\d]{24}$/i)) sessionQuery.employee = selectedEmployee;
    const sessions = await WorkSession.find(sessionQuery).sort({ dateKey: -1, updatedAt: -1 }).limit(200).populate('employee').lean();
    const sessionEvents = sessions.flatMap((session) => (session.events || []).map((event) => ({
      event: event.type,
      meaning: event.message,
      occurredAt: event.occurredAt,
      eventId: event.metadata?.eventId || 0,
      sourceLog: event.deviceInfo || 'WorkSession',
      provider: event.category || 'session',
      computer: event.deviceInfo || '',
      employee: session.employee?._id || session.employee,
      employeeId: session.employee?.rollNumber || '',
      employeeName: session.employee?.name || '',
      department: session.employee?.department || '',
      user: session.employee?.name || '',
      durationMs: event.metadata?.durationMs || 0,
      status: event.metadata?.status || session.status,
      message: event.message,
      externalId: event.metadata?.externalId || `${session._id}:${event.type}:${new Date(event.occurredAt).getTime()}`,
    }))).filter((event) => {
      const time = new Date(event.occurredAt).getTime();
      return (!from || time >= from.getTime()) && (!to || time <= to.getTime())
        && (!selectedDepartment || event.department === selectedDepartment)
        && (!selectedEmployee || String(event.employee) === selectedEmployee);
    });

    const mergedEvents = [...events, ...sessionEvents]
      .sort((a, b) => sortDirection === 1
        ? new Date(a.occurredAt) - new Date(b.occurredAt)
        : new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, limit);

    res.json({
      success: true,
      events: mergedEvents,
      range: {
        start: from,
        end: to,
        workdayEnd: mode === 'workday' ? workdayRange.fixedEnd : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/:type', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can export system event logs.' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000);
    const from = parseDateQuery(req.query.from);
    const to = parseDateQuery(req.query.to);
    const dateRange = dateOnlyRange(String(req.query.date || ''));
    const query = {};
    if (dateRange || from || to) {
      query.occurredAt = {};
      if (dateRange?.start || from) query.occurredAt.$gte = dateRange?.start || from;
      if (dateRange?.end || to) query.occurredAt.$lte = dateRange?.end || to;
    }
    if (req.query.department) {
      const employees = await Student.find({ department: String(req.query.department) }).select('_id rollNumber name').lean();
      query.$or = employees.flatMap((employee) => compactOrQuery([
        { employee: employee._id },
        { employeeId: employee.rollNumber || '' },
        { employeeName: employee.name || '' },
        { user: employee.name || '' },
      ]));
      if (!query.$or.length) query.$or = [{ user: /.^/ }];
    } else if (req.query.employee || req.query.user) {
      const selectedUser = String(req.query.employee || req.query.user);
      const employee = selectedUser.match(/^[a-f\d]{24}$/i) ? await Student.findById(selectedUser).lean() : null;
      query.$or = employee
        ? compactOrQuery([{ employee: employee._id }, { employeeId: employee.rollNumber || '' }, { employeeName: employee.name || '' }, { user: employee.name || '' }])
        : compactOrQuery([{ user: selectedUser }, { employeeName: selectedUser }, { employeeId: selectedUser }]);
    }
    const selectedEvents = parseEventFilter(req.query.event);
    if (selectedEvents.length) {
      query.event = { $in: selectedEvents };
    }
    const events = await SystemEvent.find(query).sort({ occurredAt: -1 }).limit(limit).lean();
    return sendSystemEventsExport(res, req.params.type, events);
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard-summary', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can view activity summaries.' });
    }

    const selectedDate = String(req.query.date || '').trim();
    const selectedEmployee = String(req.query.employee || '').trim();
    const selectedDepartment = String(req.query.department || '').trim();
    const period = String(req.query.period || 'daily').toLowerCase();
    const selectedEvents = parseEventFilter(req.query.event);
    const now = new Date();
    const dateRange = dateOnlyRange(selectedDate);
    const from = dateRange?.start || parseDateQuery(req.query.from) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = dateRange?.end || parseDateQuery(req.query.to) || now;

    const query = { occurredAt: { $gte: from, $lte: to } };
    if (selectedDepartment) {
      const employees = await Student.find({ department: selectedDepartment }).select('_id rollNumber name').lean();
      query.$or = employees.flatMap((employee) => compactOrQuery([
        { employee: employee._id },
        { employeeId: employee.rollNumber || '' },
        { employeeName: employee.name || '' },
        { user: employee.name || '' },
      ]));
      if (!query.$or.length) query.$or = [{ user: /.^/ }];
    } else if (selectedEmployee) {
      const employee = selectedEmployee.match(/^[a-f\d]{24}$/i) ? await Student.findById(selectedEmployee).lean() : null;
      query.$or = employee
        ? compactOrQuery([{ employee: employee._id }, { employeeId: employee.rollNumber || '' }, { employeeName: employee.name || '' }, { user: employee.name || '' }])
        : compactOrQuery([{ user: selectedEmployee }, { employeeName: selectedEmployee }, { employeeId: selectedEmployee }]);
    }
    if (selectedEvents.length) {
      query.event = { $in: selectedEvents };
    }

    const [events, latestByEmployee, liveSessions] = await Promise.all([
      SystemEvent.find(query).sort({ occurredAt: -1 }).limit(1000).lean(),
      SystemEvent.aggregate([
        { $match: query },
        { $sort: { occurredAt: -1 } },
        {
          $group: {
            _id: { $ifNull: ['$employee', { $ifNull: ['$employeeId', '$user'] }] },
            latest: { $first: '$$ROOT' },
          },
        },
        { $limit: 500 },
      ]),
      WorkSession.find({ dateKey: { $gte: from.toISOString().slice(0, 10), $lte: to.toISOString().slice(0, 10) } }).populate('employee').lean(),
    ]);

    const eventCounts = events.reduce((counts, event) => {
      counts[event.event] = (counts[event.event] || 0) + 1;
      return counts;
    }, {});
    const durationFor = (names) => events
      .filter((event) => names.includes(event.event))
      .reduce((sum, event) => sum + Number(event.durationMs || 0), 0);
    const sessionDurationMs = liveSessions.reduce((sum, session) => {
      const start = session.startedAt || session.attendanceTime;
      const end = session.checkoutAt || now;
      return start ? sum + Math.max(new Date(end).getTime() - new Date(start).getTime(), 0) : sum;
    }, 0);
    const currentStatus = latestByEmployee.map((row) => {
      const latest = row.latest || {};
      const statusEvent = latest.event;
      let status = 'Online';
      if (['Shutdown', 'Unexpected Shutdown', 'Agent Offline', 'Network Offline'].includes(statusEvent)) status = 'Offline';
      if (['Idle Time', 'Idle State', 'Inactive Duration'].includes(statusEvent)) status = 'Idle';
      if (['Lock', 'Screen Lock'].includes(statusEvent)) status = 'Locked';
      return {
        employee: latest.employee,
        employeeId: latest.employeeId,
        employeeName: latest.employeeName || latest.user || 'Unknown',
        status,
        activeApplication: latest.metadata?.processName || latest.metadata?.application || latest.metadata?.windowTitle || '',
        lastActivityAt: latest.occurredAt,
      };
    });

    res.json({
      success: true,
      period,
      range: { start: from, end: to },
      totals: {
        signIn: (eventCounts.Login || 0) + (eventCounts['Windows Sign In'] || 0) + (eventCounts['User Session Start'] || 0),
        signOut: (eventCounts.Logout || 0) + (eventCounts['Windows Sign Out'] || 0) + (eventCounts['User Session End'] || 0),
        lockUnlock: (eventCounts.Lock || 0) + (eventCounts.Unlock || 0) + (eventCounts['Screen Lock'] || 0) + (eventCounts['Screen Unlock'] || 0),
        sleepWake: (eventCounts.Sleep || 0) + (eventCounts.Wakeup || 0) + (eventCounts['System Wake'] || 0),
        shutdownRestart: (eventCounts.Shutdown || 0) + (eventCounts['Unexpected Shutdown'] || 0) + (eventCounts.Restart || 0),
        activeMs: durationFor(['Active Usage', 'Active State', 'Active Application']),
        idleMs: durationFor(['Idle Time', 'Idle State', 'Inactive Duration']),
        sessionDurationMs,
      },
      eventCounts,
      currentStatus,
      latestEvents: events.slice(0, 100).map(serializeSystemEvent),
    });
  } catch (error) {
    next(error);
  }
});

// Get detailed activity for a specific user
router.get('/users/:userId/activity', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can inspect employee activity timelines.',
      });
    }

    const userId = String(req.params.userId || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const workdayRange = getWorkdayRange();
    const from = parseDateQuery(req.query.from) || workdayRange.start;
    const to = parseDateQuery(req.query.to) || workdayRange.end;

    const events = await SystemEvent.find({
      $or: compactOrQuery([{ user: userId }, { employeeName: userId }, { employeeId: userId }, { employee: userId.match(/^[a-f\d]{24}$/i) ? userId : null }]),
      occurredAt: {
        $gte: from,
        $lte: to,
      },
    })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .lean();

    const stats = {
      totalEvents: events.length,
      uniqueEventTypes: new Set(events.map((e) => e.event)).size,
      eventBreakdown: {},
      accuracy: 100,
      user: userId,
    };

    events.forEach((event) => {
      if (!stats.eventBreakdown[event.event]) {
        stats.eventBreakdown[event.event] = 0;
      }
      stats.eventBreakdown[event.event] += 1;
    });

    res.json({
      success: true,
      user: userId,
      events,
      stats,
      range: { start: from, end: to },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ingest', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin' && !req.trustedCollector) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or trusted collectors can ingest system events.',
      });
    }

    const payloadEvents = Array.isArray(req.body.events) ? req.body.events : [req.body];
    const events = await enrichEventsWithEmployees(payloadEvents.map(normalizeSystemEvent).filter(Boolean));

    if (events.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid system events were provided',
      });
    }

    const result = await SystemEvent.bulkWrite(
      events.map((event) => ({
        updateOne: {
          filter: { externalId: event.externalId },
          update: { $setOnInsert: event },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    await Promise.all(events.map((event) => recordTrackingEvent(event)));
    await Promise.allSettled(getUpsertedOperationIndexes(result).map(async (index) => {
      const event = events[index];
      if (!event) return;
      const payload = serializeSystemEvent({
        ...event,
        _id: result.upsertedIds?.[index] || result.getRawResponse?.().upserted?.find((item) => item.index === index)?._id,
      });
      emitRoleEvent('admin', 'activity:event', payload);
      if (event.employee) {
        await emitEmployeeEvent(event.employee, 'system_event:new', payload);
      }
    }));

    res.status(201).json({
      success: true,
      received: events.length,
      inserted: result.upsertedCount || 0,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

