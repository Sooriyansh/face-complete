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

    const [records, personalEvents, workSession, workSchedule, activitySummary] = await Promise.all([
      Attendance.find(attendanceQuery).sort({ markedAt: -1 }).limit(20).populate('student').lean(),
      SystemEvent.find(eventQuery).sort({ occurredAt: -1 }).limit(20).lean(),
      employee
        ? WorkSession.findOne({ employee: employee._id, dateKey: new Date().toISOString().slice(0, 10) })
            .populate('employee')
            .populate('attendance')
            .lean()
        : null,
      getWorkSchedule(),
      getEmployeeActivitySummary(employee),
    ]);

    return { 
      employee, 
      records, 
      personalEvents, 
      workSession, 
      workSchedule,
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
