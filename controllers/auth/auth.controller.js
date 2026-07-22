const crypto = require('crypto');
const SystemEvent = require('../../models/SystemEvent');
const Student = require('../../models/Student');
const User = require('../../models/User');
const { deleteImages, uploadImageBuffer } = require('../../services/cloudinary');
const { tryRebuildFaceModelFromCloud } = require('../../services/faceModel');
const { runRecognition } = require('../../services/faceRecognition');
const { clearAuthCookie, hashPassword, setAuthCookie, verifyPassword } = require('../../services/auth/auth.service');
const { sendPasswordResetEmail } = require('../../services/email');

const EMPLOYEE_PASSWORD_LOGIN_DAILY_LIMIT = 6;

async function findEmployeeProfileForUser(user) {
  if (!user || user.role !== 'employee') return null;
  const clauses = [
    user.employeeProfile ? { _id: user.employeeProfile } : null,
    user.email ? { email: user.email } : null,
    user.employeeId ? { rollNumber: user.employeeId } : null,
  ].filter(Boolean);
  return clauses.length ? Student.findOne({ $or: clauses }).lean() : null;
}

async function recordEmployeeAuthEvent(req, user, event) {
  if (!user || user.role !== 'employee') return null;
  const employee = await findEmployeeProfileForUser(user);
  const occurredAt = new Date();
  const isLogout = event === 'Logout';
  return SystemEvent.create({
    event,
    eventName: event,
    eventType: 'session',
    meaning: isLogout ? 'Employee logged out from the website.' : 'Employee logged in to the website.',
    occurredAt,
    eventId: isLogout ? 9002 : 9001,
    sourceLog: 'WebsiteAuth',
    provider: 'FaceAIAuth',
    computer: req.get('host') || '',
    employee: employee?._id || user.employeeProfile || null,
    employeeId: employee?.rollNumber || user.employeeId || '',
    employeeName: employee?.name || user.name || '',
    user: employee?.name || user.name || user.email || '',
    ipAddress: req.ip || '',
    browser: String(req.get('user-agent') || '').slice(0, 120),
    status: isLogout ? 'Logged Out' : 'Logged In',
    message: isLogout ? 'Employee website logout recorded.' : 'Employee website login recorded.',
    metadata: {
      authUserId: String(user._id || ''),
      source: 'website-auth',
      email: user.email || '',
    },
    externalId: `auth:${event.toLowerCase()}:${user._id || employee?._id || 'employee'}:${occurredAt.getTime()}:${crypto.randomUUID()}`,
  }).catch(() => null);
}

async function saveBiometricEnrollment(faceLabel, images, savedImages = []) {
  const safeFaceLabel = String(faceLabel || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const batchId = Date.now();

  for (const [index, image] of images.entries()) {
    const [, encoded] = String(image).split(',');
    if (!encoded) {
      throw new Error(`Invalid biometric image payload at index ${index}`);
    }

    const fileName = `${String(index).padStart(3, '0')}.jpg`;
    const imageBuffer = Buffer.from(encoded, 'base64');
    const uploadResult = await uploadImageBuffer(imageBuffer, {
      folder: `faceAttendance/dataset/${safeFaceLabel}`,
      publicId: `${batchId}_${String(index).padStart(3, '0')}`,
    });

    savedImages.push({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName,
    });
  }

  return savedImages;
}

function redirectAuthenticated(req, res) {
  if (!req.user) return false;
  res.redirect(req.user.role === 'admin' ? '/' : '/employee');
  return true;
}

function showLogin(req, res) {
  if (redirectAuthenticated(req, res)) return;
  res.render('auth/login', {
    error: req.query.error || '',
    nextUrl: req.query.next || '',
  });
}

function showAdminLogin(req, res) {
  if (redirectAuthenticated(req, res)) return;
  res.render('auth/admin-login', {
    error: req.query.error || '',
    nextUrl: req.query.next || '',
  });
}

function showSignup(req, res) {
  if (redirectAuthenticated(req, res)) return;
  res.render('auth/register', { error: '' });
}

function showAdminSignup(req, res) {
  if (redirectAuthenticated(req, res)) return;
  res.render('auth/admin-register', { error: '' });
}

function showForgotPassword(req, res) {
  res.render('auth/forgot-password', { error: '', success: '' });
}

function getLocalDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.NOTIFICATION_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function resetTokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function requestPasswordReset(req, res, next) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).render('auth/forgot-password', { error: 'Enter a valid email address.', success: '' });
  }

  try {
    const user = await User.findOne({ email });
    if (user && user.accountStatus !== 'disabled') {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetTokenHash = resetTokenHash(token);
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const baseUrl = String(process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      try {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          resetUrl: `${baseUrl}/reset-password/${token}`,
        });
      } catch (error) {
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        await user.save().catch(() => {});
        console.error('Password reset email delivery failed:', error.message);
      }
    }
    return res.render('auth/forgot-password', {
      error: '',
      success: 'If an active account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
}

async function showResetPassword(req, res, next) {
  try {
    const token = String(req.params.token || '');
    const { hash, salt } = hashPassword(password);
    const user = await User.findOneAndUpdate(
      {
        passwordResetTokenHash: resetTokenHash(token),
        passwordResetExpiresAt: { $gt: new Date() },
      },
      {
        $set: { passwordHash: hash, passwordSalt: salt },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      },
      { returnDocument: 'after' }
    );
    res.status(user ? 200 : 400).render('auth/reset-password', {
      token: user ? token : '',
      error: user ? '' : 'This password reset link is invalid or has expired.',
      success: '',
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const token = String(req.params.token || '');
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    if (password.length < 8 || password !== confirmPassword) {
      return res.status(400).render('auth/reset-password', {
        token,
        error: password.length < 8 ? 'Password must contain at least 8 characters.' : 'Passwords do not match.',
        success: '',
      });
    }
    const user = await User.findOne({
      passwordResetTokenHash: resetTokenHash(token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (!user) {
      return res.status(400).render('auth/reset-password', {
        token: '', error: 'This password reset link is invalid or has expired.', success: '',
      });
    }
    clearAuthCookie(res);
    return res.render('auth/reset-password', {
      token: '', error: '', success: 'Password updated successfully. You can now sign in.',
    });
  } catch (error) {
    next(error);
  }
}

const handlePasswordLogin = (forcedRole = 'employee') => async (req, res, next) => {
  try {
    const identifier = String(req.body.email || req.body.identifier || '').trim();
    const email = identifier.toLowerCase();
    const password = String(req.body.password || '');
    const loginRole = forcedRole === 'admin' ? 'admin' : 'employee';
    const user = await User.findOne(
      loginRole === 'admin'
        ? { email }
        : {
            role: 'employee',
            $or: [{ email }, { employeeId: identifier }],
          }
    );

    if (!user || user.role !== loginRole || !verifyPassword(password, user) || user.accountStatus !== 'active') {
      return res.status(401).render(loginRole === 'admin' ? 'auth/admin-login' : 'auth/login', {
        error: loginRole === 'admin' ? 'Admin email or password is incorrect.' : 'Employee ID/email or password is incorrect.',
        nextUrl: req.body.next || '',
      });
    }

    if (loginRole === 'employee') {
      const todayKey = getLocalDayKey();
      if (user.passwordLoginLimitDay !== todayKey) {
        user.passwordLoginLimitDay = todayKey;
        user.passwordLoginLimitCount = 0;
      }

      if (Number(user.passwordLoginLimitCount || 0) >= EMPLOYEE_PASSWORD_LOGIN_DAILY_LIMIT) {
        return res.status(429).render('auth/login', {
          error: 'Password sign-in limit reached for today. Please use face scan sign-in or try password sign-in again tomorrow.',
          nextUrl: req.body.next || '',
        });
      }

      user.passwordLoginLimitCount = Number(user.passwordLoginLimitCount || 0) + 1;
      await user.save();
    }

    setAuthCookie(res, user);
    await recordEmployeeAuthEvent(req, user, 'Login');
    const fallbackUrl = user.role === 'admin' ? '/' : '/employee';
    res.redirect(req.body.next || fallbackUrl);
  } catch (error) {
    next(error);
  }
};

async function signup(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const role = req.body.role === 'admin' ? 'admin' : 'employee';
    const employeeId = String(req.body.employeeId || '').trim();
    const department = String(req.body.department || '').trim();
    const phoneNumber = String(req.body.phoneNumber || '').trim();
    const enrollmentImages = Array.isArray(req.body.enrollmentImages) ? req.body.enrollmentImages : [];
    const signupView = role === 'admin' ? 'auth/admin-register' : 'auth/register';

    if (!name || !email || password.length < 6 || password !== confirmPassword) {
      return res.status(400).render(signupView, {
        error: 'Name, valid email, matching passwords, and a minimum 6-character password are required.',
      });
    }

    if (role === 'employee' && (!employeeId || !department || !phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Employee signup requires employee ID, department, and phone number.',
      });
    }

    if (role === 'employee' && enrollmentImages.length > 0 && enrollmentImages.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Capture at least 6 face scans, or skip face capture and create the account with password login only.',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.is('application/json')) {
        return res.status(409).json({ success: false, message: 'An account already exists with this email.' });
      }
      return res.status(409).render(signupView, { error: 'An account already exists with this email.' });
    }

    const { hash, salt } = hashPassword(password);
    let employeeProfile = null;

    if (role === 'employee') {
      const faceLabel = `${employeeId}_${email.split('@')[0]}`.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const existingStudent = await Student.findOne({ $or: [{ faceLabel }, { email }, { rollNumber: employeeId }] }).lean();
      if (existingStudent) {
        return res.status(409).json({ success: false, message: 'Employee profile already exists for this email or employee ID.' });
      }

      let savedImages = [];
      const hasBiometricEnrollment = enrollmentImages.length >= 6;
      try {
        if (hasBiometricEnrollment) {
          savedImages = await saveBiometricEnrollment(faceLabel, enrollmentImages);
        }

        employeeProfile = await Student.create({
          name,
          faceLabel,
          rollNumber: employeeId,
          joiningDate: new Date(),
          department,
          email,
          phoneNumber,
          profileImage: savedImages[0]
            ? { url: savedImages[0].url, publicId: savedImages[0].publicId }
            : undefined,
          faceLoginEnabled: hasBiometricEnrollment,
          biometricEncryptionStatus: hasBiometricEnrollment ? 'Encrypted' : 'Pending',
          livenessStatus: hasBiometricEnrollment ? 'Passed' : 'Pending',
          enrollmentImages: savedImages,
          enrollmentStatus: hasBiometricEnrollment ? 'Verified' : 'Pending',
          enrollmentReviewedAt: hasBiometricEnrollment ? new Date() : null,
          enrollmentReviewNote: hasBiometricEnrollment
            ? 'Auto verified during secure signup biometric enrollment.'
            : 'Account created without face capture. Face login is disabled until biometric enrollment is completed.',
        });

        if (hasBiometricEnrollment) {
          const modelBuild = await tryRebuildFaceModelFromCloud();
          if (!modelBuild.success) {
            employeeProfile.enrollmentReviewNote = `Biometric images stored in Cloudinary. Model rebuild warning: ${modelBuild.message}`;
            await employeeProfile.save();
          }
        }
      } catch (error) {
        if (employeeProfile) {
          await Student.findByIdAndDelete(employeeProfile._id);
        }
        await deleteImages(savedImages.map((image) => image.publicId));
        return res.status(500).json({
          success: false,
          message: 'Employee signup failed. Camera scans could not be stored or the account could not be created.',
          details: error.message,
        });
      }
    }

    const user = await User.create({
      name,
      email,
      role,
      employeeProfile: employeeProfile ? employeeProfile._id : null,
      employeeId,
      department,
      phoneNumber,
      faceLoginEnabled: role === 'employee' && Boolean(employeeProfile?.faceLoginEnabled),
      accountStatus: 'active',
      passwordHash: hash,
      passwordSalt: salt,
    });

    setAuthCookie(res, user);
    if (req.is('application/json')) {
      const modelWarning = employeeProfile?.enrollmentReviewNote?.includes('Model rebuild warning')
        ? employeeProfile.enrollmentReviewNote
        : '';
      return res.status(201).json({
        success: true,
        redirectTo: role === 'admin' ? '/' : '/employee',
        user: { name: user.name, email: user.email, role: user.role },
        modelWarning,
        faceLoginEnabled: Boolean(employeeProfile?.faceLoginEnabled),
      });
    }
    res.redirect(role === 'admin' ? '/' : '/employee');
  } catch (error) {
    next(error);
  }
}

async function employeeFaceLogin(req, res, next) {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'Face image is required.' });
    }

    const [, encoded] = image.split(',');
    if (!encoded) {
      return res.status(400).json({ success: false, message: 'Invalid face image payload.' });
    }

    let recognition;
    try {
      recognition = await runRecognition(Buffer.from(encoded, 'base64'));
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Face recognition service unavailable. Train the biometric model first.',
        details: error.message,
      });
    }

    if (!recognition.success || !recognition.matched) {
      return res.json({
        success: true,
        recognized: false,
        message: recognition.message || 'Face detected, but identity confidence is low.',
        confidence: recognition.confidence || 0,
        box: recognition.box || null,
        quality: recognition.quality || null,
        quality_issues: recognition.quality_issues || [],
        stage: recognition.stage || 'not_matched',
      });
    }

    const employee = await Student.findOne({ faceLabel: recognition.label }).lean();
    const user = employee
      ? await User.findOne({
          role: 'employee',
          $or: [{ employeeProfile: employee._id }, { email: employee.email }],
          faceLoginEnabled: true,
          accountStatus: 'active',
        })
      : null;

    if (!user) {
      return res.status(401).json({
        success: false,
        recognized: false,
        message: 'Face recognized, but no active employee account is linked.',
        confidence: recognition.confidence || 0,
      });
    }

    setAuthCookie(res, user);
    await recordEmployeeAuthEvent(req, user, 'Login');
    res.json({
      success: true,
      recognized: true,
      redirectTo: '/employee',
      confidence: recognition.confidence || 0,
      employee: {
        name: employee.name,
        faceLabel: employee.faceLabel,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res) {
  await recordEmployeeAuthEvent(req, req.user, 'Logout');
  clearAuthCookie(res);
  res.redirect('/login');
}

module.exports = {
  employeeFaceLogin,
  handlePasswordLogin,
  logout,
  requestPasswordReset,
  resetPassword,
  showAdminLogin,
  showAdminSignup,
  showForgotPassword,
  showResetPassword,
  showLogin,
  showSignup,
  signup,
};
