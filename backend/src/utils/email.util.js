import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Values shipped in .env / .env.example as placeholders — treat them as "not configured".
const SMTP_PLACEHOLDERS = new Set(['smtp.example.com', 'your_smtp_user', 'your_smtp_password']);

function isSmtpConfigured() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASSWORD || '').trim();
  return host && user && pass &&
    !SMTP_PLACEHOLDERS.has(host.toLowerCase()) &&
    !SMTP_PLACEHOLDERS.has(user) &&
    !SMTP_PLACEHOLDERS.has(pass);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// In dev/test (or whenever SMTP is unconfigured) print the message to the server
// console instead of sending, so an evaluator can complete the flow with no email account.
function logDevEmail(mail) {
  console.log('\n' + '='.repeat(62));
  console.log('DEV EMAIL — SMTP not configured, logging instead of sending');
  console.log(`  To:      ${mail.to}`);
  console.log(`  Subject: ${mail.subject}`);
  if (mail.devUrl) console.log(`  Link:    ${mail.devUrl}`);
  console.log('='.repeat(62) + '\n');
}

async function deliver(mail) {
  if (!isSmtpConfigured() && process.env.NODE_ENV !== 'production') {
    logDevEmail(mail);
    return;
  }
  return transporter.sendMail(mail);
}

export const sendVerificationEmail = async (to, token) => {
  const verifyUrl = `${process.env.CORS_ORIGIN}/verify-email#token=${token}`;

  return deliver({
    from: `"Matcha App" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your Matcha account',
    html: `
      <h1>Welcome to Matcha!</h1>
      <p>Please click the link below to verify your account:</p>
      <a href="${verifyUrl}">Verify Account</a>
      <p>This link will expire in 24 hours.</p>
    `,
    devUrl: verifyUrl,
  });
};

export const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.CORS_ORIGIN}/reset-password#token=${token}`;

  return deliver({
    from: `"Matcha App" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your Matcha password',
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 30 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
    devUrl: resetUrl,
  });
};

export const sendEmailChange = (to, token) => {
  const changeUrl = `${process.env.CORS_ORIGIN}/verify-email-change#token=${token}`;
  return deliver({
    from: process.env.SMTP_USER,
    to,
    subject: 'Verify your new Matcha email',
    html: `<a href="${changeUrl}">Verify new email</a>`,
    devUrl: changeUrl,
  });
};

export const sendEmailChangeCompleted = (to) => deliver({
  from: process.env.SMTP_USER,
  to,
  subject: 'Your Matcha email was changed',
  text: 'The email address for your Matcha account has been changed. All previous sessions have been signed out. Contact support immediately if you did not authorize this change.',
});
