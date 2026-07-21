const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/admin/leave', requireRole('admin'), adminController.leaveManagementPage);
router.get('/leave-requests', requireRole('admin'), (req, res) => res.redirect('/admin/leave'));
//route
module.exports = router;
