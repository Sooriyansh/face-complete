const Attendance = require('../../models/Attendance');
const DailyWorkReport = require('../../models/DailyWorkReport');
const LeaveRequest = require('../../models/LeaveRequest');
const Notification = require('../../models/Notification');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');
const { getWorkSchedule } = require('../../services/workSchedule');

const MS_PER_HOUR = 60 * 60 * 1000;

function dateKeyFor(date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function hoursFromMs(ms) {
  return Math.round((Number(ms || 0) / MS_PER_HOUR) * 10) / 10;
}

function scoreLevel(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Average';
  return 'Needs Improvement';
}

function taskProgress(status) {
  if (status === 'Completed') return 100;
  if (status === 'Partially Completed') return 60;
  if (status === 'Pending') return 25;
  return 0;
}

function trend(current, previous) {
  const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;
  return {
    change,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

function buildMiniChart(seed, total = 7) {
  return Array.from({ length: total }, (_, index) => {
    const wave = Math.sin((index + 1) * 1.4 + seed) * 18;
    return clamp(46 + wave + seed * 4, 12, 96);
  });
}

async function buildPerformanceOverview({ todayKey, students, liveSessions }) {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekStart = addDays(today, -6);
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekEnd = addDays(weekStart, -1);
  const monthStart = startOfMonth(now);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = addDays(monthStart, -1);
  const yearStart = startOfYear(now);
  const totalEmployees = students.length;
  const employeeIds = students.map((student) => student._id);
  const liveSessionMap = new Map(liveSessions.map((session) => [String(session.employee?._id || session.employee), session]));

  const [
    todayAttendance,
    weekAttendance,
    previousWeekAttendance,
    monthAttendance,
    previousMonthAttendance,
    yearAttendance,
    todayReports,
    monthReports,
    yearReports,
    latestReports,
    monthSessions,
    yearSessions,
    activeLeaves,
    monthLeaves,
    yearLeaves,
  ] = await Promise.all([
    Attendance.find({ dateKey: todayKey }).populate('student').lean(),
    Attendance.find({ markedAt: { $gte: weekStart, $lt: tomorrow } }).lean(),
    Attendance.find({ markedAt: { $gte: previousWeekStart, $lte: previousWeekEnd } }).lean(),
    Attendance.find({ markedAt: { $gte: monthStart, $lt: tomorrow } }).lean(),
    Attendance.find({ markedAt: { $gte: previousMonthStart, $lte: previousMonthEnd } }).lean(),
    Attendance.find({ markedAt: { $gte: yearStart, $lt: tomorrow } }).lean(),
    DailyWorkReport.find({ reportDate: todayKey }).populate('employee').populate('workSession').lean(),
    DailyWorkReport.find({ createdAt: { $gte: monthStart, $lt: tomorrow } }).populate('employee').lean(),
    DailyWorkReport.find({ createdAt: { $gte: yearStart, $lt: tomorrow } }).populate('employee').lean(),
    DailyWorkReport.find().sort({ createdAt: -1 }).limit(8).populate('employee').lean(),
    WorkSession.find({ dateKey: { $gte: dateKeyFor(monthStart), $lte: todayKey } }).populate('employee').lean(),
    WorkSession.find({ dateKey: { $gte: dateKeyFor(yearStart), $lte: todayKey } }).populate('employee').lean(),
    LeaveRequest.find({ status: 'Approved', startDate: { $lt: tomorrow }, endDate: { $gte: today } }).populate('employee').lean(),
    LeaveRequest.find({ status: 'Approved', startDate: { $lt: tomorrow }, endDate: { $gte: monthStart } }).populate('employee').lean(),
    LeaveRequest.find({ status: 'Approved', startDate: { $lt: tomorrow }, endDate: { $gte: yearStart } }).populate('employee').lean(),
  ]);

  const presentEmployeeIds = new Set(todayAttendance.map((record) => String(record.student?._id || record.student)));
  const onLeaveIds = new Set(activeLeaves.map((leave) => String(leave.employee?._id || leave.employee)));
  const statusCounts = liveSessions.reduce((counts, session) => {
    const status = session.status || 'offline';
    if (status === 'checked_out') counts.checkedOut += 1;
    else if (['active', 'idle', 'sleep', 'break'].includes(status)) counts.active += 1;
    return counts;
  }, { active: 0, checkedOut: 0 });

  const completedToday = todayReports.filter((report) => report.taskStatus === 'Completed').length;
  const pendingToday = todayReports.filter((report) => report.taskStatus !== 'Completed').length + Math.max(totalEmployees - todayReports.length, 0);
  const monthlyOvertimeHours = hoursFromMs(monthSessions.reduce((sum, session) => sum + Number(session.overtimeMs || 0), 0));
  const yearlyOvertimeHours = hoursFromMs(yearSessions.reduce((sum, session) => sum + Number(session.overtimeMs || 0), 0));

  const topCards = [
    { label: 'Total Employees', value: totalEmployees, icon: 'fa-users', tone: 'info', trend: trend(totalEmployees, Math.max(totalEmployees - 1, 0)), chart: buildMiniChart(totalEmployees || 1) },
    { label: 'Present Today', value: presentEmployeeIds.size, icon: 'fa-calendar-check', tone: 'success', trend: trend(presentEmployeeIds.size, Math.round(previousWeekAttendance.length / 7)), chart: buildMiniChart(presentEmployeeIds.size || 2) },
    { label: 'Absent Today', value: Math.max(totalEmployees - presentEmployeeIds.size - onLeaveIds.size, 0), icon: 'fa-user-xmark', tone: 'danger', trend: trend(Math.max(totalEmployees - presentEmployeeIds.size, 0), Math.max(totalEmployees - Math.round(previousWeekAttendance.length / 7), 0)), chart: buildMiniChart(3) },
    { label: 'Active Employees', value: statusCounts.active, icon: 'fa-bolt', tone: 'success', trend: trend(statusCounts.active, Math.round(presentEmployeeIds.size * 0.72)), chart: buildMiniChart(4) },
    { label: 'Checked Out Employees', value: statusCounts.checkedOut, icon: 'fa-right-from-bracket', tone: 'violet', trend: trend(statusCounts.checkedOut, Math.round(presentEmployeeIds.size * 0.2)), chart: buildMiniChart(5) },
    { label: 'Pending Tasks', value: pendingToday, icon: 'fa-list-check', tone: 'warning', trend: trend(pendingToday, Math.round(monthReports.filter((report) => report.taskStatus !== 'Completed').length / Math.max(now.getDate(), 1))), chart: buildMiniChart(6) },
    { label: 'Completed Tasks', value: completedToday, icon: 'fa-circle-check', tone: 'success', trend: trend(completedToday, Math.round(monthReports.filter((report) => report.taskStatus === 'Completed').length / Math.max(now.getDate(), 1))), chart: buildMiniChart(7) },
    { label: 'Employees On Leave', value: activeLeaves.length, icon: 'fa-calendar-minus', tone: 'warning', trend: trend(activeLeaves.length, Math.round(monthLeaves.length / Math.max(now.getDate(), 1))), chart: buildMiniChart(8) },
    { label: 'Overtime Hours This Month', value: monthlyOvertimeHours, icon: 'fa-business-time', tone: 'violet', trend: trend(monthlyOvertimeHours, hoursFromMs(monthSessions.reduce((sum, session) => sum + Number(session.weekendMs || 0), 0))), chart: buildMiniChart(9) },
  ];

  const monthWorkingDays = Array.from({ length: now.getDate() }, (_, index) => new Date(now.getFullYear(), now.getMonth(), index + 1))
    .filter((date) => ![0, 6].includes(date.getDay())).length || now.getDate();
  const yearWorkingDays = Math.max(Math.round((now - yearStart) / (24 * 60 * 60 * 1000) * (5 / 7)), 1);

  const rows = students.map((student) => {
    const employeeId = String(student._id);
    const todaySession = liveSessionMap.get(employeeId);
    const employeeMonthReports = monthReports.filter((report) => String(report.employee?._id || report.employee) === employeeId);
    const employeeYearReports = yearReports.filter((report) => String(report.employee?._id || report.employee) === employeeId);
    const employeeMonthSessions = monthSessions.filter((session) => String(session.employee?._id || session.employee) === employeeId);
    const employeeYearSessions = yearSessions.filter((session) => String(session.employee?._id || session.employee) === employeeId);
    const employeeMonthAttendance = monthAttendance.filter((record) => String(record.student?._id || record.student) === employeeId);
    const employeeYearAttendance = yearAttendance.filter((record) => String(record.student?._id || record.student) === employeeId);
    const employeeMonthLeaves = monthLeaves.filter((leave) => String(leave.employee?._id || leave.employee) === employeeId);
    const attendanceRate = pct(employeeMonthAttendance.length, monthWorkingDays);
    const completionRate = pct(employeeMonthReports.filter((report) => report.taskStatus === 'Completed').length, Math.max(employeeMonthReports.length, 1));
    const reportRate = pct(employeeMonthReports.length, monthWorkingDays);
    const overtimeHours = hoursFromMs(employeeMonthSessions.reduce((sum, session) => sum + Number(session.overtimeMs || 0), 0));
    const consistency = pct(employeeYearAttendance.length, yearWorkingDays);
    const productivityScore = Math.round(clamp((attendanceRate * 0.3) + (completionRate * 0.35) + (reportRate * 0.15) + Math.min(overtimeHours * 2, 10) + (consistency * 0.1)));
    const todayReport = todayReports.find((report) => String(report.employee?._id || report.employee) === employeeId);
    const status = presentEmployeeIds.has(employeeId) ? 'Present' : onLeaveIds.has(employeeId) ? 'On Leave' : 'Absent';
    const taskStatus = todayReport?.taskStatus || todaySession?.taskStatus || (todaySession?.dailyPlan ? 'Pending' : 'Not Started');

    return {
      id: employeeId,
      name: student.name,
      department: student.department || 'Unassigned',
      joinTime: todaySession?.startedAt || todayReport?.joinTime || null,
      checkoutTime: todaySession?.checkoutAt || todayReport?.checkoutTime || null,
      todayTask: todayReport?.dailyPlan || todaySession?.dailyPlan || 'No plan submitted',
      taskStatus,
      progress: taskProgress(taskStatus),
      workSummary: todayReport?.workSummary || todaySession?.workSummary || todaySession?.checkoutNote || '-',
      pendingWork: todayReport?.pendingTasks || todaySession?.pendingWork || '-',
      attendanceRate,
      completedTasks: employeeMonthReports.filter((report) => report.taskStatus === 'Completed').length,
      pendingTasks: employeeMonthReports.filter((report) => report.taskStatus !== 'Completed').length,
      leaveCount: employeeMonthLeaves.reduce((sum, leave) => sum + Number(leave.days || 0), 0),
      overtimeHours,
      productivityScore,
      productivityLevel: scoreLevel(productivityScore),
      status,
      annual: {
        attendance: employeeYearAttendance.length,
        completedTasks: employeeYearReports.filter((report) => report.taskStatus === 'Completed').length,
        pendingTasks: employeeYearReports.filter((report) => report.taskStatus !== 'Completed').length,
        leaveDays: yearLeaves.filter((leave) => String(leave.employee?._id || leave.employee) === employeeId).reduce((sum, leave) => sum + Number(leave.days || 0), 0),
        workHours: hoursFromMs(employeeYearSessions.reduce((sum, session) => sum + Number(session.totalWorkingMs || 0), 0)),
        overtimeHours: hoursFromMs(employeeYearSessions.reduce((sum, session) => sum + Number(session.overtimeMs || 0), 0)),
      },
    };
  }).sort((a, b) => b.productivityScore - a.productivityScore);

  const monthlyBars = rows.slice(0, 8).map((row) => ({ label: row.name, value: row.productivityScore }));
  const attendanceTrend = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(now.getFullYear(), index, 1);
    const nextMonth = new Date(now.getFullYear(), index + 1, 1);
    const records = yearAttendance.filter((record) => {
      const markedAt = new Date(record.markedAt);
      return markedAt >= month && markedAt < nextMonth;
    });
    return { label: month.toLocaleString('en', { month: 'short' }), value: pct(records.length, Math.max(totalEmployees * 22, 1)) };
  });

  return {
    generatedAt: now,
    topCards,
    taskRows: rows,
    latestReports,
    attendance: {
      today: presentEmployeeIds.size,
      weekly: weekAttendance.length,
      monthly: monthAttendance.length,
      yearly: yearAttendance.length,
      presentDays: monthAttendance.length,
      absentDays: Math.max(totalEmployees * monthWorkingDays - monthAttendance.length, 0),
      leaveDays: monthLeaves.reduce((sum, leave) => sum + Number(leave.days || 0), 0),
      lateArrivals: monthSessions.filter((session) => session.startedAt && new Date(session.startedAt).getHours() >= 10).length,
      earlyCheckouts: monthSessions.filter((session) => session.checkoutAt && new Date(session.checkoutAt).getHours() < 17).length,
      monthlyRate: pct(monthAttendance.length, Math.max(totalEmployees * monthWorkingDays, 1)),
      yearlyRate: pct(yearAttendance.length, Math.max(totalEmployees * yearWorkingDays, 1)),
      trend: attendanceTrend,
      previousMonthlyRate: pct(previousMonthAttendance.length, Math.max(totalEmployees * 22, 1)),
      weeklyRate: pct(weekAttendance.length, Math.max(totalEmployees * 7, 1)),
    },
    monthly: {
      totalWorkingDays: monthWorkingDays,
      totalAttendance: monthAttendance.length,
      completedTasks: monthReports.filter((report) => report.taskStatus === 'Completed').length,
      pendingTasks: monthReports.filter((report) => report.taskStatus !== 'Completed').length,
      leaveTaken: monthLeaves.reduce((sum, leave) => sum + Number(leave.days || 0), 0),
      overtimeHours: monthlyOvertimeHours,
      productivityScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.productivityScore, 0) / rows.length) : 0,
      employeeComparison: monthlyBars,
    },
    yearly: {
      totalAttendance: yearAttendance.length,
      totalCompletedTasks: yearReports.filter((report) => report.taskStatus === 'Completed').length,
      totalPendingTasks: yearReports.filter((report) => report.taskStatus !== 'Completed').length,
      totalLeaveDays: yearLeaves.reduce((sum, leave) => sum + Number(leave.days || 0), 0),
      totalWorkHours: hoursFromMs(yearSessions.reduce((sum, session) => sum + Number(session.totalWorkingMs || 0), 0)),
      totalOvertimeHours: yearlyOvertimeHours,
      ranking: {
        bestAttendance: [...rows].sort((a, b) => b.attendanceRate - a.attendanceRate)[0],
        mostProductive: rows[0],
        mostConsistent: [...rows].sort((a, b) => b.annual.attendance - a.annual.attendance)[0],
        highestOvertime: [...rows].sort((a, b) => b.overtimeHours - a.overtimeHours)[0],
      },
    },
  };
}

async function dashboard(req, res, next) {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = startOfDay(new Date());
    const nextWeek = addDays(today, 7);
    const [studentCount, todayAttendanceCount, recentAttendance, students, liveSessions, latestNotifications, upcomingLeaves] = await Promise.all([
      Student.countDocuments(),
      Attendance.countDocuments({ dateKey: todayKey }),
      Attendance.find().sort({ markedAt: -1 }).limit(8).populate('student').lean(),
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
      Notification.find({ recipientRole: 'admin' }).sort({ createdAt: -1 }).limit(5).lean(),
      LeaveRequest.find({ status: { $in: ['Pending', 'Approved'] }, startDate: { $gte: today, $lte: nextWeek } }).sort({ startDate: 1 }).limit(5).populate('employee').lean(),
    ]);
    const systemEventCount = await SystemEvent.countDocuments();
    const performanceOverview = await buildPerformanceOverview({ todayKey, students, liveSessions });
    const liveSessionStatuses = liveSessions.map((session) => ({
      status: session.status,
      liveStatus: session.status === 'checked_out' ? 'checked_out' : session.deviceState === 'Sleep Mode' ? 'sleep' : session.status,
    }));
    const dashboardActivityCounts = {
      todayAttendance: todayAttendanceCount,
      currentlyOnline: liveSessionStatuses.filter((row) => ['active', 'idle', 'sleep', 'break'].includes(row.liveStatus)).length,
      offline: Math.max(students.length - liveSessions.filter((session) => session.status !== 'checked_out').length, 0),
      working: liveSessionStatuses.filter((row) => row.liveStatus === 'active').length,
      idle: liveSessionStatuses.filter((row) => row.liveStatus === 'idle').length,
      sleeping: liveSessionStatuses.filter((row) => row.liveStatus === 'sleep').length,
      checkedOut: liveSessionStatuses.filter((row) => row.liveStatus === 'checked_out').length,
    };

    res.render('admin/dashboard', {
      studentCount,
      todayAttendanceCount,
      recentAttendance,
      safeRecentAttendance: Array.isArray(recentAttendance) ? recentAttendance : [],
      students,
      systemEventCount,
      liveSessions,
      performanceOverview,
      dashboardActivityCounts,
      latestFaceRecognitionEvents: recentAttendance,
      latestNotifications,
      upcomingLeaves,
    });
  } catch (error) {
    next(error);
  }
}

async function attendancePage(req, res, next) {
  try {
    const records = await Attendance.find().sort({ markedAt: -1 }).limit(20).populate('student').lean();
    res.render('admin/attendance', { records });
  } catch (error) {
    next(error);
  }
}

async function systemEventsPage(req, res, next) {
  try {
    const now = new Date();
    const workdayStart = new Date(now);
    workdayStart.setHours(8, 0, 0, 0);
    const workdayEnd = new Date(now);
    workdayEnd.setHours(17, 0, 0, 0);
    const rangeEnd = now < workdayEnd ? now : workdayEnd;

    const [systemEvents, students, liveSessions] = await Promise.all([
      SystemEvent.find().sort({ occurredAt: -1 }).limit(100).lean(),
      Student.find().sort({ name: 1 }).lean(),
      WorkSession.find({ dateKey: now.toISOString().slice(0, 10) }).populate('employee').populate('attendance').lean(),
    ]);
    const sessionByEmployee = new Map(liveSessions.map((session) => [String(session.employee?._id || session.employee), session]));
    const latestByEmployee = new Map();
    systemEvents.forEach((event) => {
      const key = String(event.employee || event.employeeId || event.employeeName || event.user || '');
      if (key && !latestByEmployee.has(key)) latestByEmployee.set(key, event);
    });
    const employeeStatuses = students.map((student) => {
      const session = sessionByEmployee.get(String(student._id));
      const latest = latestByEmployee.get(String(student._id))
        || latestByEmployee.get(student.rollNumber || '')
        || latestByEmployee.get(student.name || '');
      let status = session?.status === 'checked_out' ? 'Offline' : session ? 'Online' : 'Offline';
      const latestEvent = latest?.event || '';
      if (['Idle Time', 'Idle State', 'Inactive Duration'].includes(latestEvent)) status = 'Idle';
      if (['Lock', 'Screen Lock'].includes(latestEvent)) status = 'Locked';
      if (['Shutdown', 'Unexpected Shutdown', 'Agent Offline', 'Network Offline'].includes(latestEvent)) status = 'Offline';
      return {
        employeeId: String(student._id),
        status,
        lastActivityAt: latest?.occurredAt || session?.lastActivityAt || session?.updatedAt || null,
        activeApplication: latest?.metadata?.processName || latest?.metadata?.application || latest?.metadata?.windowTitle || '',
      };
    });

    res.render('admin/system-events', {
      systemEvents,
      students,
      employeeStatuses,
      systemEventRange: {
        start: workdayStart,
        end: rangeEnd,
        workdayEnd,
      },
      liveSessions,
    });
  } catch (error) {
    next(error);
  }
}

async function leaveManagementPage(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [leaves, totalEmployees] = await Promise.all([
      LeaveRequest.find().sort({ createdAt: -1 }).populate('employee').lean(),
      Student.countDocuments(),
    ]);

    const departmentStats = leaves.reduce((stats, leave) => {
      const department = leave.employee?.department || 'Unassigned';
      stats[department] = (stats[department] || 0) + 1;
      return stats;
    }, {});

    res.render('admin/leave-management', {
      leaves,
      totalEmployees,
      analytics: {
        total: leaves.length,
        approved: leaves.filter((leave) => leave.status === 'Approved').length,
        rejected: leaves.filter((leave) => leave.status === 'Rejected').length,
        onLeaveToday: leaves.filter((leave) => leave.status === 'Approved' && new Date(leave.startDate) < tomorrow && new Date(leave.endDate) >= today).length,
        departmentStats,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function dailyReportsPage(req, res, next) {
  try {
    const query = {};
    if (req.query.date) query.reportDate = String(req.query.date);
    if (req.query.status) query.taskStatus = String(req.query.status);

    const [reports, students] = await Promise.all([
      DailyWorkReport.find(query).sort({ createdAt: -1 }).limit(500).populate('employee').populate('workSession').lean(),
      Student.find().sort({ name: 1 }).lean(),
    ]);

    const filteredReports = reports.filter((report) => {
      const employeeId = String(report.employee?._id || report.employee || '');
      const department = report.employee?.department || '';
      return (!req.query.employee || employeeId === String(req.query.employee)) &&
        (!req.query.department || department === String(req.query.department));
    });

    res.render('admin/daily-reports', {
      reports: filteredReports,
      students,
      filters: {
        date: req.query.date || '',
        employee: req.query.employee || '',
        department: req.query.department || '',
        status: req.query.status || '',
      },
    });
  } catch (error) {
    next(error);
  }
}

async function overtimePage(req, res, next) {
  try {
    const sessions = await WorkSession.find().sort({ dateKey: -1 }).limit(1000).populate('employee').lean();
    const byEmployee = new Map();
    sessions.forEach((session) => {
      const employee = session.employee || {};
      const key = String(employee._id || session.employee);
      const row = byEmployee.get(key) || {
        employeeName: employee.name || 'Employee',
        department: employee.department || '-',
        totalWorkingMs: 0,
        overtimeMs: 0,
        weekendMs: 0,
      };
      row.totalWorkingMs += Number(session.totalWorkingMs || 0);
      row.overtimeMs += Number(session.overtimeMs || 0);
      row.weekendMs += Number(session.weekendMs || 0);
      byEmployee.set(key, row);
    });
    res.render('admin/overtime', { rows: Array.from(byEmployee.values()).sort((a, b) => b.overtimeMs - a.overtimeMs), sessions });
  } catch (error) {
    next(error);
  }
}

async function employeesPage(req, res, next) {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const [students, liveSessions] = await Promise.all([
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
    ]);

    res.render('admin/employees', { students, liveSessions });
  } catch (error) {
    next(error);
  }
}

async function performancePage(req, res, next) {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const [students, liveSessions] = await Promise.all([
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
    ]);
    const performanceOverview = await buildPerformanceOverview({ todayKey, students, liveSessions });

    res.render('admin/performance', { students, liveSessions, performanceOverview });
  } catch (error) {
    next(error);
  }
}

async function analyticsPage(req, res, next) {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const [students, liveSessions] = await Promise.all([
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
    ]);
    const performanceOverview = await buildPerformanceOverview({ todayKey, students, liveSessions });

    res.render('admin/analytics', { performanceOverview });
  } catch (error) {
    next(error);
  }
}

async function notificationsPage(req, res, next) {
  try {
    const [students, notifications] = await Promise.all([
      Student.find().sort({ name: 1 }).lean(),
      Notification.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    res.render('admin/notifications', { students, notifications });
  } catch (error) {
    next(error);
  }
}

function settingsPage(req, res) {
  getWorkSchedule()
    .then((workSchedule) => res.render('admin/settings', { workSchedule }))
    .catch((error) => res.render('admin/settings', { workSchedule: null, scheduleError: error.message }));
}

module.exports = {
  analyticsPage,
  attendancePage,
  dailyReportsPage,
  dashboard,
  employeesPage,
  leaveManagementPage,
  notificationsPage,
  overtimePage,
  performancePage,
  settingsPage,
  systemEventsPage,
};
