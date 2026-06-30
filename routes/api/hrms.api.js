const express = require('express');

const DailyWorkReport = require('../../models/DailyWorkReport');
const LeaveRequest = require('../../models/LeaveRequest');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');
const { calculateLeaveDays, formatDuration, rowsToCsv, toDateKey } = require('../../services/hrms');
const { notifyAdmins, notifyEmployee } = require('../../services/notifications');

const router = express.Router();

function hrmsEvent(fields) {
  return SystemEvent.create({
    eventId: Date.now() + Math.floor(Math.random() * 1000),
    sourceLog: 'HRMS',
    externalId: `hrms-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...fields,
  }).catch(() => {});
}

function requireAdmin(req, res) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin access is required.' });
    return false;
  }
  return true;
}

async function getCurrentEmployee(req) {
  if (req.user?.role !== 'employee') {
    return null;
  }
  const clauses = [];
  if (req.user.email) clauses.push({ email: req.user.email });
  if (req.user.employeeProfile) clauses.push({ _id: req.user.employeeProfile });
  if (req.user.employeeId) clauses.push({ rollNumber: req.user.employeeId });
  
  if (clauses.length === 0) return null;
  
  return Student.findOne({ $or: clauses }).lean();
}

function normalizeReportRows(rows) {
  return rows.map((report) => ({
    ...report,
    employeeName: report.employee?.name || 'Employee',
    department: report.employee?.department || '-',
    checkoutLabel: report.checkoutTime ? new Date(report.checkoutTime).toLocaleString() : '-',
  }));
}

function sendExport(res, type, filename, rows, headers, title) {
  if (type === 'pdf') {
    res.type('html');
    return res.send(`<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef}</style></head><body><h1>${title}</h1><table><thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${h.value(row)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.print()</script></body></html>`);
  }

  const csv = rowsToCsv(rows, headers);
  const extension = type === 'excel' ? 'xls' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.${extension}"`);
  res.type(type === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  return res.send(csv);
}

router.get('/employee/summary', async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req);
    if (!employee) {
      return res.status(403).json({ success: false, message: 'Employee profile is required.' });
    }

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [leaves, sessions] = await Promise.all([
      LeaveRequest.find({ employee: employee._id }).sort({ createdAt: -1 }).lean(),
      WorkSession.find({ employee: employee._id, startedAt: { $gte: yearStart } }).sort({ dateKey: -1 }).lean(),
    ]);

    const approvedPaidDays = leaves
      .filter((leave) => leave.status === 'Approved' && leave.leaveType !== 'Unpaid Leave')
      .reduce((total, leave) => total + Number(leave.days || 0), 0);
    const monthlyOvertimeMs = sessions
      .filter((session) => String(session.dateKey || '').startsWith(toDateKey().slice(0, 7)))
      .reduce((total, session) => total + Number(session.overtimeMs || 0), 0);
    const weeklyOvertimeMs = sessions.slice(0, 7).reduce((total, session) => total + Number(session.overtimeMs || 0), 0);

    res.json({
      success: true,
      leaves,
      balance: {
        total: 24,
        used: approvedPaidDays,
        remaining: Math.max(24 - approvedPaidDays, 0),
      },
      overtime: {
        today: sessions.find((session) => session.dateKey === toDateKey()) || null,
        weeklyOvertimeMs,
        monthlyOvertimeMs,
        weekendMs: sessions.reduce((total, session) => total + Number(session.weekendMs || 0), 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/leaves', async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req);
    if (!employee) {
      return res.status(403).json({ success: false, message: 'Employee profile is required.' });
    }

    const leaveType = String(req.body.leaveType || '');
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate || req.body.startDate);
    const reason = String(req.body.reason || '').trim();

    if (!leaveType || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || !reason) {
      return res.status(400).json({ success: false, message: 'Leave type, dates, and reason are required.' });
    }

    const leave = await LeaveRequest.create({
      employee: employee._id,
      leaveType,
      startDate,
      endDate,
      days: calculateLeaveDays(startDate, endDate, leaveType),
      reason,
      attachmentName: String(req.body.attachmentName || '').trim(),
    });

    await hrmsEvent({
      user: employee.name,
      event: 'New Leave Request',
      meaning: `${employee.name} applied for ${leave.leaveType}.`,
      occurredAt: new Date(),
      provider: 'HRMS',
    });
    await notifyAdmins({
      senderId: employee._id,
      senderModel: 'Student',
      senderRole: 'employee',
      title: 'New Leave Request',
      message: 'A new leave request has been submitted.',
      type: 'Leave Request',
      priority: 'high',
      actionUrl: '/leave-requests',
      metadata: { leaveId: leave._id, employeeId: employee._id },
    });

    res.status(201).json({ success: true, message: 'Leave request submitted and marked Pending.', leave });
  } catch (error) {
    next(error);
  }
});

router.post('/leaves/:id/cancel', async (req, res, next) => {
  try {
    const employee = await getCurrentEmployee(req);
    const leave = employee ? await LeaveRequest.findOne({ _id: req.params.id, employee: employee._id }) : null;
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request was not found.' });
    }
    if (leave.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending leaves can be cancelled.' });
    }
    leave.status = 'Cancelled';
    await leave.save();
    res.json({ success: true, message: 'Pending leave request cancelled.', leave });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/leaves', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const status = ['Pending', 'Approved', 'Rejected'].includes(req.query.status) ? req.query.status : null;
    const leaves = await LeaveRequest.find(status ? { status } : {})
      .sort({ createdAt: -1 })
      .populate('employee')
      .lean();
    res.json({ success: true, leaves });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/leaves/:id/decision', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const status = req.body.status === 'Approved' ? 'Approved' : 'Rejected';
    const leave = await LeaveRequest.findById(req.params.id).populate('employee');
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request was not found.' });
    }
    const adminRemarks = String(req.body.adminRemarks || '').trim();
    if (status === 'Rejected' && !adminRemarks) {
      return res.status(400).json({ success: false, message: 'Please enter a reason before rejecting the leave request.' });
    }
    leave.status = status;
    leave.adminRemarks = adminRemarks || 'Approved by admin.';
    leave.decidedAt = new Date();
    leave.decidedBy = req.user._id;
    await leave.save();
    await notifyEmployee(leave.employee, {
      senderId: req.user._id,
      senderRole: 'admin',
      title: status === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
      message: status === 'Approved' ? 'Your leave request has been approved.' : 'Your leave request has been rejected.',
      type: status === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
      priority: 'high',
      actionUrl: '/employee#leave-management',
      metadata: { leaveId: leave._id, status, adminRemarks },
    });
    res.json({
      success: true,
      message: status === 'Approved' ? 'Leave approved successfully.' : 'Leave rejected with reason.',
      leave,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/reports', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const search = String(req.query.search || '').trim();
    const reports = await DailyWorkReport.find()
      .sort({ createdAt: -1 })
      .limit(250)
      .populate('employee')
      .populate('workSession')
      .lean();
    const filtered = search
      ? reports.filter((report) => JSON.stringify(report).toLowerCase().includes(search.toLowerCase()))
      : reports;
    res.json({ success: true, reports: normalizeReportRows(filtered) });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/overtime', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const sessions = await WorkSession.find().sort({ dateKey: -1 }).limit(1000).populate('employee').lean();
    const leaderboard = new Map();

    sessions.forEach((session) => {
      const employee = session.employee || {};
      const key = String(employee._id || session.employee);
      const row = leaderboard.get(key) || {
        employeeName: employee.name || 'Employee',
        department: employee.department || '-',
        totalWorkingMs: 0,
        overtimeMs: 0,
        weekendMs: 0,
      };
      row.totalWorkingMs += Number(session.totalWorkingMs || 0);
      row.overtimeMs += Number(session.overtimeMs || 0);
      row.weekendMs += Number(session.weekendMs || 0);
      leaderboard.set(key, row);
    });

    res.json({
      success: true,
      rows: Array.from(leaderboard.values()).sort((a, b) => b.overtimeMs - a.overtimeMs),
      sessions,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/export/:kind/:type', async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { kind, type } = req.params;

    if (kind === 'leaves') {
      const rows = await LeaveRequest.find().sort({ createdAt: -1 }).populate('employee').lean();
      return sendExport(res, type, 'leave-reports', rows, [
        { label: 'Employee', value: (row) => row.employee?.name || '-' },
        { label: 'Department', value: (row) => row.employee?.department || '-' },
        { label: 'Leave Type', value: (row) => row.leaveType },
        { label: 'Days', value: (row) => row.days },
        { label: 'Applied Date', value: (row) => new Date(row.createdAt).toLocaleDateString() },
        { label: 'Status', value: (row) => row.status },
        { label: 'Remarks', value: (row) => row.adminRemarks || '-' },
      ], 'Leave Reports');
    }

    if (kind === 'daily-reports') {
      const rows = normalizeReportRows(await DailyWorkReport.find().sort({ createdAt: -1 }).populate('employee').lean());
      return sendExport(res, type, 'daily-work-reports', rows, [
        { label: 'Employee', value: (row) => row.employeeName },
        { label: 'Department', value: (row) => row.department },
        { label: 'Report Date', value: (row) => row.reportDate },
        { label: 'Join Time', value: (row) => row.joinTime ? new Date(row.joinTime).toLocaleString() : '-' },
        { label: 'Checkout Time', value: (row) => row.checkoutLabel },
        { label: 'Daily Plan', value: (row) => row.dailyPlan || '-' },
        { label: 'Task Status', value: (row) => row.taskStatus || 'Pending' },
        { label: 'Work Summary', value: (row) => row.workSummary },
        { label: 'Completed Tasks', value: (row) => (row.completedTasks || []).join('; ') },
        { label: 'Pending Work', value: (row) => row.pendingTasks },
      ], 'Daily Work Reports');
    }

    const rows = (await WorkSession.find().sort({ dateKey: -1 }).populate('employee').lean()).map((row) => ({
      ...row,
      employeeName: row.employee?.name || '-',
      department: row.employee?.department || '-',
    }));
    return sendExport(res, type, 'overtime-reports', rows, [
      { label: 'Employee', value: (row) => row.employeeName },
      { label: 'Department', value: (row) => row.department },
      { label: 'Date', value: (row) => row.dateKey },
      { label: 'Total Working Hours', value: (row) => formatDuration(row.totalWorkingMs) },
      { label: 'Overtime', value: (row) => formatDuration(row.overtimeMs) },
      { label: 'Weekend Hours', value: (row) => formatDuration(row.weekendMs) },
    ], 'Overtime Reports');
  } catch (error) {
    next(error);
  }
});

module.exports = router;

