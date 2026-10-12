import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendVerificationEmail = async (to, token) => {
  const verifyUrl = `${process.env.CORS_ORIGIN}/verify?token=${token}`;
  
  const mailOptions = {
    from: `"Matcha App" <${process.env.SMTP_USER}>`,
    to,
    subject: "Verify your Matcha account",
    html: `
      <h1>Welcome to Matcha!</h1>
      <p>Please click the link below to verify your account:</p>
      <a href="${verifyUrl}">Verify Account</a>
      <p>This link will expire in 24 hours.</p>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

export const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: `"Matcha App" <${process.env.SMTP_USER}>`,
    to,
    subject: "Reset your Matcha password",
    html: `
      <h1>Password Reset Request</h1>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  };

  return await transporter.sendMail(mailOptions);
};
