const User = require("../models/User");
const OtpVerification = require("../models/OtpVerification");
const RefreshToken = require("../models/RefreshToken");
const generateOtp = require("../utils/generateOtp");
const { hash, compare } = require("../utils/hash");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/tokens");
const { sendOtpEmail } = require("../config/mailer");
const { success, error } = require("../utils/responseEnvelope");

async function issueTokens(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: await hash(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  return { accessToken, refreshToken };
}

exports.signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const localPart = normalizedEmail.split("@")[0];
    if (password.toLowerCase() === localPart.toLowerCase()) {
      return error(res, 400, "VALIDATION_ERROR", "Password cannot be the same as your email username.");
    }

    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.isVerified) {
      return error(res, 409, "EMAIL_EXISTS", "An account with this email already exists. Please sign in.");
    }

    if (!user) {
      const passwordHash = await hash(password);
      user = await User.create({ name, email: normalizedEmail, passwordHash });
    } else {
      user.name = name;
      user.passwordHash = await hash(password);
      await user.save();
    }

    await OtpVerification.deleteMany({ email: normalizedEmail, purpose: "SIGNUP" });

    const otp = generateOtp();
    await OtpVerification.create({
      email: normalizedEmail,
      purpose: "SIGNUP",
      otpHash: await hash(otp),
      expiresAt: new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 5) * 60000),
    });

    await sendOtpEmail(normalizedEmail, otp, "SIGNUP");
    return success(res, 201, "Verification code sent to your email.");
  } catch (err) {
    next(err);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp, purpose } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const record = await OtpVerification.findOne({ email: normalizedEmail, purpose }).sort({ createdAt: -1 });

    if (!record || record.expiresAt < new Date()) {
      if (record) await OtpVerification.deleteOne({ _id: record._id });
      return error(res, 400, "OTP_EXPIRED", "Code has expired. Please request a new one.");
    }

    if (record.attempts >= (process.env.OTP_MAX_ATTEMPTS || 5)) {
      return error(res, 429, "OTP_MAX_ATTEMPTS", "Too many incorrect attempts. Please request a new code.");
    }

    const isMatch = await compare(otp, record.otpHash);
    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      const remaining = (process.env.OTP_MAX_ATTEMPTS || 5) - record.attempts;
      return error(res, 400, "OTP_INVALID", `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`);
    }

    if (purpose === "SIGNUP") {
      const user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { isVerified: true },
        { new: true }
      );
      await OtpVerification.deleteOne({ _id: record._id });

      const tokens = await issueTokens(user, res);
      return success(res, 200, "Email verified successfully.", {
        accessToken: tokens.accessToken,
        user: { id: user._id, name: user.name, email: user.email },
      });
    }

    if (purpose === "LOGIN") {
      const user = await User.findOne({ email: normalizedEmail });
      await OtpVerification.deleteOne({ _id: record._id });

      const tokens = await issueTokens(user, res);
      return success(res, 200, "Signed in successfully.", {
        accessToken: tokens.accessToken,
        user: { id: user._id, name: user.name, email: user.email },
      });
    }

    await OtpVerification.deleteOne({ _id: record._id });
    return success(res, 200, "Code verified. You can now reset your password.");
  } catch (err) {
    next(err);
  }
};

exports.resendOtp = async (req, res, next) => {
  try {
    const { email, purpose } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const latestOtp = await OtpVerification.findOne({ email: normalizedEmail, purpose }).sort({ createdAt: -1 });
    if (latestOtp) {
      const elapsed = Date.now() - latestOtp.createdAt.getTime();
      const cooldown = (process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
      if (elapsed < cooldown) {
        const retryAfterSeconds = Math.ceil((cooldown - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          error: {
            code: "RESEND_COOLDOWN",
            message: `Please wait ${retryAfterSeconds} seconds before requesting a new code.`,
          },
          retryAfterSeconds,
        });
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await OtpVerification.countDocuments({
      email: normalizedEmail,
      purpose,
      createdAt: { $gte: oneHourAgo },
    });
    if (hourlyCount >= (process.env.OTP_HOURLY_LIMIT || 5)) {
      return error(res, 429, "RESEND_LIMIT", "Too many code requests. Please try again later.");
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return success(res, 200, "If an account exists, a new code has been sent.");
    }

    await OtpVerification.deleteMany({ email: normalizedEmail, purpose });
    const otp = generateOtp();
    await OtpVerification.create({
      email: normalizedEmail,
      purpose,
      otpHash: await hash(otp),
      expiresAt: new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 5) * 60000),
    });

    await sendOtpEmail(normalizedEmail, otp, purpose);
    return success(res, 200, "A new verification code has been sent to your email.");
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return error(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return error(res, 423, "ACCOUNT_LOCKED", `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`);
    }

    if (!user.isVerified) {
      return error(res, 403, "NOT_VERIFIED", "Please verify your email address first.");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= (process.env.LOGIN_MAX_ATTEMPTS || 5)) {
        user.lockedUntil = new Date(Date.now() + (process.env.LOGIN_LOCK_MINUTES || 15) * 60000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return error(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await OtpVerification.deleteMany({ email: normalizedEmail, purpose: "LOGIN" });

    const otp = generateOtp();
    await OtpVerification.create({
      email: normalizedEmail,
      purpose: "LOGIN",
      otpHash: await hash(otp),
      expiresAt: new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 5) * 60000),
    });

    await sendOtpEmail(normalizedEmail, otp, "LOGIN");
    return success(res, 200, "Verification code sent to your email.", {
      requiresOtp: true,
      email: normalizedEmail,
    });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const genericMessage = "If an account with that email exists, a reset code has been sent.";

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return success(res, 200, genericMessage);
    }

    const latestOtp = await OtpVerification.findOne({ email: normalizedEmail, purpose: "PASSWORD_RESET" }).sort({ createdAt: -1 });
    if (latestOtp) {
      const elapsed = Date.now() - latestOtp.createdAt.getTime();
      const cooldown = (process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
      if (elapsed < cooldown) {
        return success(res, 200, genericMessage);
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await OtpVerification.countDocuments({
      email: normalizedEmail,
      purpose: "PASSWORD_RESET",
      createdAt: { $gte: oneHourAgo },
    });
    if (hourlyCount >= (process.env.OTP_HOURLY_LIMIT || 5)) {
      return success(res, 200, genericMessage);
    }

    await OtpVerification.deleteMany({ email: normalizedEmail, purpose: "PASSWORD_RESET" });
    const otp = generateOtp();
    await OtpVerification.create({
      email: normalizedEmail,
      purpose: "PASSWORD_RESET",
      otpHash: await hash(otp),
      expiresAt: new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 5) * 60000),
    });

    await sendOtpEmail(normalizedEmail, otp, "PASSWORD_RESET");
    return success(res, 200, genericMessage);
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const record = await OtpVerification.findOne({ email: normalizedEmail, purpose: "PASSWORD_RESET" }).sort({ createdAt: -1 });

    if (!record || record.expiresAt < new Date()) {
      if (record) await OtpVerification.deleteOne({ _id: record._id });
      return error(res, 400, "OTP_EXPIRED", "Code has expired. Please request a new one.");
    }

    if (record.attempts >= (process.env.OTP_MAX_ATTEMPTS || 5)) {
      return error(res, 429, "OTP_MAX_ATTEMPTS", "Too many incorrect attempts. Please request a new code.");
    }

    const isMatch = await compare(otp, record.otpHash);
    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      return error(res, 400, "OTP_INVALID", "Incorrect code.");
    }

    const localPart = normalizedEmail.split("@")[0];
    if (newPassword.toLowerCase() === localPart.toLowerCase()) {
      return error(res, 400, "VALIDATION_ERROR", "Password cannot be the same as your email username.");
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return error(res, 400, "OTP_EXPIRED", "No account found.");
    }

    user.passwordHash = await hash(newPassword);
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await OtpVerification.deleteOne({ _id: record._id });

    await RefreshToken.updateMany({ userId: user._id }, { revoked: true });

    res.clearCookie("refreshToken", { path: "/" });

    return success(res, 200, "Password updated successfully. Please sign in with your new password.");
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      return error(res, 401, "TOKEN_INVALID", "No refresh token provided.");
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return error(res, 401, "TOKEN_INVALID", "Invalid or expired refresh token.");
    }

    const storedTokens = await RefreshToken.find({ userId: decoded.sub, revoked: false });
    let matchedToken = null;
    for (const stored of storedTokens) {
      const isMatch = await compare(token, stored.tokenHash);
      if (isMatch) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      await RefreshToken.updateMany({ userId: decoded.sub }, { revoked: true });
      res.clearCookie("refreshToken", { path: "/" });
      return error(res, 401, "TOKEN_INVALID", "Refresh token not recognized. All sessions revoked for security.");
    }

    matchedToken.revoked = true;
    await matchedToken.save();

    const user = await User.findById(decoded.sub);
    if (!user) {
      return error(res, 401, "TOKEN_INVALID", "User not found.");
    }

    const tokens = await issueTokens(user, res);
    return success(res, 200, "Token refreshed.", { accessToken: tokens.accessToken });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (token) {
      const storedTokens = await RefreshToken.find({ revoked: false });
      for (const stored of storedTokens) {
        const isMatch = await compare(token, stored.tokenHash);
        if (isMatch) {
          stored.revoked = true;
          await stored.save();
          break;
        }
      }
    }

    res.clearCookie("refreshToken", { path: "/" });
    return success(res, 200, "Signed out successfully.");
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash -failedLoginAttempts -lockedUntil -__v");
    if (!user) {
      return error(res, 404, "NOT_FOUND", "User not found.");
    }
    return success(res, 200, "User profile.", { user });
  } catch (err) {
    next(err);
  }
};