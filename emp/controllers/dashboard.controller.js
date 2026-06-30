const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');
const { getEmployeeActivitySummary } = require('../../services/activityHistory');
const { getWorkSchedule } = require('../../services/workSchedule');

async function getEmployeePageData(req) {
    let employeeQuery = {};
    if (req.user && req.user.role === 'employee') {
      const clauses = [];
      if (req.user.email) clauses.push({ email: req.user.email });
      if (req.user.employeeProfile) clauses.push({ _id: req.user.employeeProfile });
      if (req.user.employeeId) clauses.push({ rollNumber: req.user.employeeId });
      employeeQuery = clauses.length > 0 ? { $or: clauses } : { _id: null };
    }

    const employee = await Student.findOne(employeeQuery).sort({ createdAt: -1 }).lean();
    
    // Strict scoping: If employee profile not found, ensure queries return nothing.
    const attendanceQuery = employee ? { student: employee._id } : { _id: null };
    
    const compactOrQuery = (clauses) => clauses.filter((clause) => {
      const value = Object.values(clause)[0];
      return value !== '' && value != null;
    });
    
    const eventQuery = employee
      ? {
          $or: compactOrQuery([
            { employee: employee._id },
            { employeeId: employee.rollNumber || '' },
            { employeeName: employee.name || '' },
            { user: employee.name || '' },
          ]),
        }
      : { _id: null };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [records, personalEvents, todayEvents, workSession, workSchedule, activitySummary] = await Promise.all([
      Attendance.find(attendanceQuery).sort({ markedAt: -1 }).limit(20).populate('student').lean(),
      SystemEvent.find(eventQuery).sort({ occurredAt: -1 }).limit(100).lean(),
      SystemEvent.find({ ...eventQuery, occurredAt: { $gte: todayStart, $lt: todayEnd } }).sort({ occurredAt: -1 }).limit(500).lean(),
      employee
        ? WorkSession.findOne({ employee: employee._id, dateKey: new Date().toISOString().slice(0, 10) })
            .populate('employee')
            .populate('attendance')
            .lean()
        : null,
      getWorkSchedule(),
      getEmployeeActivitySummary(employee),
    ]);

    const latestEvent = todayEvents[0] || personalEvents[0] || null;
    const eventDuration = (names) => todayEvents
      .filter((event) => names.includes(event.event))
      .reduce((sum, event) => sum + Number(event.durationMs || 0), 0);
    const firstEvent = (names) => [...todayEvents].reverse().find((event) => names.includes(event.event));
    const lastEvent = (names) => todayEvents.find((event) => names.includes(event.event));
    const loginEvent = firstEvent(['Login', 'Windows Login', 'Windows Sign In', 'User Session Start', 'Session Connect']);
    const logoutEvent = lastEvent(['Logout', 'Windows Logout', 'Windows Sign Out', 'User Session End', 'Session Disconnect']);
    const activeMs = Number(workSession?.activeMs || 0) + eventDuration(['Active Usage', 'Active State', 'Active Application']);
    const idleMs = Number(workSession?.idleMs || 0) + eventDuration(['Idle Time', 'Idle State', 'Inactive Duration']);
    const workingMs = Number(workSession?.totalWorkingMs || 0) || (workSession?.startedAt ? Math.max(new Date(workSession.checkoutAt || Date.now()).getTime() - new Date(workSession.startedAt).getTime(), 0) : activeMs + idleMs);
    const latestName = latestEvent?.event || '';
    const currentStatus = ['Agent Offline', 'Shutdown', 'Unexpected Shutdown', 'Network Offline', 'Internet Disconnected'].includes(latestName)
      ? 'Offline'
      : ['Idle Time', 'Idle State', 'Inactive Duration'].includes(latestName)
        ? 'Idle'
        : latestName === 'Sleep'
          ? 'Sleeping'
          : ['Lock', 'Screen Lock'].includes(latestName)
            ? 'Locked'
            : latestEvent
              ? 'Online'
              : 'Not connected';
    
    return { 
      employee, 
      records, 
      personalEvents, 
      todayEvents,
      workSession, 
      workSchedule,
      currentStatus,
      desktopAgentStatus: latestEvent ? (latestName === 'Agent Offline' ? 'Offline' : 'Connected') : 'Not connected',
      internetStatus: ['Internet Disconnected', 'Network Offline'].includes(latestName) ? 'Offline' : ['Internet Connected', 'Network Online'].includes(latestName) ? 'Online' : 'Unknown',
      machineStatus: latestEvent?.hostname || latestEvent?.computer || latestEvent?.machineId || 'Unknown',
      todayWorkingMs: workingMs,
      todayActiveMs: activeMs,
      todayIdleMs: idleMs,
      loginTime: loginEvent?.occurredAt || workSession?.startedAt || null,
      logoutTime: logoutEvent?.occurredAt || workSession?.checkoutAt || null,
      joinWorkTime: workSession?.startedAt || null,
      leaveWorkTime: workSession?.checkoutAt || null,
      signInCount: activitySummary.signInCount,
      lockUnlockCount: activitySummary.lockUnlockCount,
      sleepWakeCount: activitySummary.sleepWakeCount,
      totalActivityCount: activitySummary.totalActivityCount
    };
}

function renderEmployeePage(view) {
  return async function employeePage(req, res, next) {
    try {
      res.render(`employee/${view}`, await getEmployeePageData(req));
    } catch (error) {
      next(error);
    }
  };
}

async function dashboard(req, res, next) {
  try {
    res.render('employee/dashboard', await getEmployeePageData(req));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  attendancePage: renderEmployeePage('attendance'),
  attendanceHistoryPage: renderEmployeePage('attendance-history'),
  activityPage: renderEmployeePage('activity'),
  dashboard,
  devicePage: renderEmployeePage('device'),
  enrollmentPage: renderEmployeePage('enrollment'),
  leaveHistoryPage: renderEmployeePage('leave-history'),
  leavePage: renderEmployeePage('leave'),
  overtimePage: renderEmployeePage('overtime'),
  workSessionPage: renderEmployeePage('work-session'),
};
