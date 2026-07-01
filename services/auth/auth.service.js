const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const AUTH_SECRET = process.env.AUTH_SECRET || 'change-this-auth-secret-in-env';
const AUTH_COOKIE = 'faceai_auth';

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('=') || '');
    return cookies;
  }, {});
}

function hashPassword(password) {
  return { hash: bcrypt.hashSync(password, 12), salt: 'bcrypt' };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash) return false;
  if (String(user.passwordHash).startsWith('$2')) {
    return bcrypt.compareSync(password, user.passwordHash);
  }
  const legacyHash = crypto.pbkdf2Sync(password, user.passwordSalt, 120000, 64, 'sha512').toString('hex');
  const stored = Buffer.from(user.passwordHash, 'hex');
  const candidate = Buffer.from(legacyHash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(candidate, stored);
}

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token) {
  if (!token || token.split('.').length !== 3) return null;
  const [header, body, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature.length !== expectedSignature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.expiresAt && Date.now() > payload.expiresAt) return null;
  return payload;
}

function setAuthCookie(res, user) {
  const token = signJwt({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secureFlag}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

module.exports = {
  AUTH_COOKIE,
  clearAuthCookie,
  hashPassword,
  parseCookies,
  setAuthCookie,
  verifyJwt,
  verifyPassword,
};
