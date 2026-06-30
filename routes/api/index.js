const express = require('express');
const attendanceRoutes = require('./attendance.api');
const hrmsRoutes = require('./hrms.api');
const notificationRoutes = require('./notifications.api');
const studentRoutes = require('./employees.api');
const systemEventRoutes = require('./system-events.api');
const workSessionRoutes = require('./work-sessions.api');
const { getWorkSchedule, saveWorkSchedule } = require('../../services/workSchedule');
const { requireAuth } = require('../../middleware/roleCheck');
const { notFoundApi } = require('../../middleware/errorHandler');

const router = express.Router();

router.use('/students', requireAuth, studentRoutes);
router.use('/attendance', requireAuth, attendanceRoutes);
router.use('/system-events', requireAuth, systemEventRoutes);
router.use('/work-sessions', requireAuth, workSessionRoutes);
router.use('/hrms', requireAuth, hrmsRoutes);
router.use('/notifications', requireAuth, notificationRoutes);
router.get('/work-schedule', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, schedule: await getWorkSchedule() });
  } catch (error) {
    next(error);
  }
});

// Employee-facing alias for fetching the current schedule
router.get('/employee/work-schedule', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, schedule: await getWorkSchedule() });
  } catch (error) {
    next(error);
  }
});

router.post('/work-schedule', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can update work schedule settings.' });
    }
    const schedule = await saveWorkSchedule(req.body, req.user?._id || null);

    // Broadcast updated schedule to all connected employees in real-time
    const io = req.app.locals.io;
    if (io) {
      io.to('role:employee').emit('schedule:updated', {
        officeJoinTime: schedule.officeJoinTime,
        checkOutTime: schedule.checkOutTime,
        workingHours: schedule.workingHours,
        breakMinutes: schedule.breakMinutes,
        gracePeriodMinutes: schedule.gracePeriodMinutes,
        overtimeStartTime: schedule.overtimeStartTime,
        updatedAt: schedule.updatedAt || new Date(),
      });
    }

    res.json({ success: true, schedule });
  } catch (error) {
    next(error);
  }
});
router.use(notFoundApi);

module.exports = router;

