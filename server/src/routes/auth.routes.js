const express = require("express");
const router = express.Router();
const auth = require("../controllers/auth.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const { otpLimiter, loginLimiter } = require("../middlewares/rateLimiter");
const {
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/auth.validators");

router.post("/signup", validate(signupSchema), auth.signup);
router.post("/verify-otp", validate(verifyOtpSchema), auth.verifyOtp);
router.post("/resend-otp", otpLimiter, validate(resendOtpSchema), auth.resendOtp);
router.post("/login", loginLimiter, validate(loginSchema), auth.login);
router.post("/forgot-password", otpLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), auth.resetPassword);
router.post("/refresh-token", auth.refreshToken);
router.post("/logout", auth.logout);
router.get("/me", authenticate, auth.me);

module.exports = router;
