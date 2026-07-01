const express = require('express');
const authController = require('../controllers/auth/auth.controller');
const { rateLimitAuth } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/login', authController.showLogin);
router.post('/login', rateLimitAuth, authController.handlePasswordLogin('employee'));
router.get('/admin-login', authController.showAdminLogin);
router.post('/admin-login', rateLimitAuth, authController.handlePasswordLogin('admin'));
router.get('/signup', authController.showSignup);
router.get('/admin-signup', authController.showAdminSignup);
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', rateLimitAuth, authController.requestPasswordReset);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password/:token', rateLimitAuth, authController.resetPassword);
router.post('/signup', rateLimitAuth, authController.signup);
router.post('/employee-face-login', rateLimitAuth, authController.employeeFaceLogin);
router.post('/logout', authController.logout);

module.exports = router;
