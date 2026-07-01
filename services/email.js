const nodemailer = require('nodemailer');

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Reset your FaceAI Attend password',
    text: `Hello ${name || 'there'},\n\nReset your password using this link: ${resetUrl}\n\nThis link expires in 60 minutes. If you did not request this, ignore this email.`,
  });
}

module.exports = { sendPasswordResetEmail };
