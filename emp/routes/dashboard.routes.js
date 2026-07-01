const express = require('express');
const employeeController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/employee', requireRole('admin', 'employee'), employeeController.dashboard);
router.get('/employee/attendance', requireRole('admin', 'employee'), employeeController.attendancePage);
router.get('/employee/enrollment', requireRole('admin', 'employee'), employeeController.enrollmentPage);
router.get('/employee/profile', requireRole('employee'), employeeController.profilePage);
router.post('/employee/profile', requireRole('employee'), employeeController.updateProfile);
router.get('/employee/work-session', requireRole('admin', 'employee'), employeeController.workSessionPage);
router.get('/employee/leave', requireRole('admin', 'employee'), employeeController.leavePage);
router.get('/employee/overtime', requireRole('admin', 'employee'), employeeController.overtimePage);
router.get('/employee/work-hours', requireRole('admin', 'employee'), (req, res) => res.redirect('/employee/overtime'));
router.get('/employee/my-attendance', requireRole('admin', 'employee'), employeeController.attendanceHistoryPage);
router.get('/employee/attendance-history', requireRole('admin', 'employee'), (req, res) => res.redirect('/employee/my-attendance'));
router.get('/employee/leave-history', requireRole('admin', 'employee'), employeeController.leaveHistoryPage);
router.get('/employee/activity', requireRole('admin', 'employee'), employeeController.activityPage);
router.get('/employee/device', requireRole('admin', 'employee'), employeeController.devicePage);

module.exports = router;
