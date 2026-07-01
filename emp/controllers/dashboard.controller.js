const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');
const User = require('../../models/User');
const { getEmployeeActivitySummary } = require('../../services/activityHistory');
const { getWorkSchedule } = require('../../services/workSchedule');
const { deleteImages, uploadImageBuffer } = require('../../services/cloudinary');
const { hashPassword, setAuthCookie, verifyPassword } = require('../../services/auth/auth.service');

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
    if (employee && !employee.profileImage?.url && employee.enrollmentImages?.[0]?.url) {
      employee.profileImage = {
        url: employee.enrollmentImages[0].url,
        publicId: employee.enrollmentImages[0].publicId,
      };
      await Student.updateOne({ _id: employee._id }, { profileImage: employee.profileImage });
    }
    
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

async function profilePage(req, res, next) {
  try {
    res.render('employee/profile', { ...(await getEmployeePageData(req)), error: '', success: '' });
  } catch (error) {
    next(error);
  }
}

function decodeProfileImage(image) {
  const match = String(image || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error('Profile photo must be a JPEG, PNG, or WebP image.');
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    const error = new Error('Profile photo must be smaller than 5 MB.');
    error.status = 400;
    throw error;
  }
  return buffer;
}

async function updateProfile(req, res, next) {
  let uploadedImage = null;
  try {
    const user = await User.findById(req.user._id);
    const employee = user?.employeeProfile
      ? await Student.findById(user.employeeProfile)
      : await Student.findOne({ email: req.user.email });
    if (!user || !employee || user.role !== 'employee') {
      return res.status(404).json({ success: false, message: 'Employee profile was not found.' });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    const department = String(req.body.department || '').trim();
    const designation = String(req.body.designation || '').trim();
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phoneNumber || !department) {
      return res.status(400).json({ success: false, message: 'Name, valid email, phone number, and department are required.' });
    }
    if (newPassword && (newPassword.length < 8 || !verifyPassword(currentPassword, user))) {
      return res.status(400).json({
        success: false,
        message: newPassword.length < 8 ? 'New password must contain at least 8 characters.' : 'Current password is incorrect.',
      });
    }
    const emailOwner = await User.findOne({ email, _id: { $ne: user._id } }).lean();
    const employeeEmailOwner = await Student.findOne({ email, _id: { $ne: employee._id } }).lean();
    if (emailOwner || employeeEmailOwner) {
      return res.status(409).json({ success: false, message: 'That email address is already in use.' });
    }

    const previous = {
      employee: employee.toObject(),
      image: employee.profileImage?.toObject ? employee.profileImage.toObject() : { ...(employee.profileImage || {}) },
    };
    if (req.body.profileImage) {
      uploadedImage = await uploadImageBuffer(decodeProfileImage(req.body.profileImage), {
        folder: `faceAttendance/profiles/${employee.faceLabel}`,
        publicId: `profile_${Date.now()}`,
      });
      employee.profileImage = { url: uploadedImage.secure_url, publicId: uploadedImage.public_id };
    }
    Object.assign(employee, { name, email, phoneNumber, department, designation });
    Object.assign(user, { name, email, phoneNumber, department, designation, employeeProfile: employee._id });
    if (newPassword) {
      const { hash, salt } = hashPassword(newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
    }

    try {
      await employee.save();
      await user.save();
    } catch (error) {
      await Student.replaceOne({ _id: employee._id }, previous.employee).catch(() => {});
      if (uploadedImage) await deleteImages([uploadedImage.public_id]).catch(() => {});
      throw error;
    }

    const previousPublicId = previous.image?.publicId;
    const isEnrollmentAsset = employee.enrollmentImages.some((item) => item.publicId === previousPublicId);
    if (uploadedImage && previousPublicId && !isEnrollmentAsset) {
      await deleteImages([previousPublicId]).catch(() => {});
    }
    setAuthCookie(res, user);
    req.app.locals.io?.to(`user:${user._id}`).emit('profile:updated', {
      name: employee.name,
      profileImageUrl: employee.profileImage?.url || '',
    });
    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      employee: {
        name: employee.name,
        email: employee.email,
        phoneNumber: employee.phoneNumber,
        department: employee.department,
        designation: employee.designation,
        profileImage: employee.profileImage,
      },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'That email address is already in use.' });
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
  profilePage,
  updateProfile,
  workSessionPage: renderEmployeePage('work-session'),
};
