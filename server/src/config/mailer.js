const nodemailer = require("nodemailer");

const isDev = process.env.NODE_ENV === "development";

let transporter;

if (!isDev && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD !== "<16-char-app-password>") {
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  transporter.verify((err) => {
    if (err) console.error("SMTP connection failed:", err.message);
    else console.log("SMTP ready");
  });
}

function otpEmailTemplate(otp, purpose) {
  const heading = purpose === "PASSWORD_RESET" ? "Reset your password" : purpose === "LOGIN" ? "Sign-in verification" : "Verify your email";
  return {
    subject: heading,
    text: `${heading}\n\nYour verification code is ${otp}. It expires in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.\nIf you didn't request this, ignore this email.`,
    html: `<div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 48px 32px; background: #f5f5f5;">
      <div style="background: #ffffff; border-radius: 16px; padding: 48px 32px; border: 1px solid #e7e5e4;">
        <h2 style="font-family: 'Georgia', serif; font-size: 28px; font-weight: 300; color: #0c0a09; margin: 0 0 8px 0; letter-spacing: -0.28px;">${heading}</h2>
        <p style="font-size: 15px; color: #4e4e4e; line-height: 1.5; margin: 0 0 32px 0;">Enter the following code to continue. This code expires in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.</p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 32px 0;">
          <span style="font-family: 'SF Mono', 'Fira Code', monospace; font-size: 36px; font-weight: 600; letter-spacing: 8px; color: #0c0a09;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #777169; line-height: 1.5; margin: 0;">If you didn't request this code, you can safely ignore this email.</p>
      </div>
    </div>`,
  };
}

async function sendOtpEmail(to, otp, purpose) {
  if (!transporter) {
    console.log("──────────────────────────────────────");
    console.log(`  OTP for ${to}: ${otp}`);
    console.log(`  Purpose: ${purpose}`);
    console.log("──────────────────────────────────────");
    return;
  }

  const { subject, text, html } = otpEmailTemplate(otp, purpose);
  const mail = {
    from: `"OTP Auth" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    await transporter.sendMail(mail);
  } catch (err) {
    try {
      await new Promise((r) => setTimeout(r, 1000));
      await transporter.sendMail(mail);
    } catch (retryErr) {
      console.error("SMTP delivery failed:", retryErr.message);
      console.log("──────────────────────────────────────");
      console.log(`  [FALLBACK] OTP for ${to}: ${otp}`);
      console.log(`  Purpose: ${purpose}`);
      console.log("──────────────────────────────────────");
    }
  }
}

module.exports = { sendOtpEmail };
