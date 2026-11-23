const { z } = require("zod");

const signupSchema = z.object({
  name: z
    .string({ required_error: "Name is required." })
    .min(1, "Name is required.")
    .max(100, "Name must be under 100 characters.")
    .trim(),
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .max(255)
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required." })
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be under 128 characters."),
});

const verifyOtpSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .trim()
    .toLowerCase(),
  otp: z
    .string({ required_error: "OTP is required." })
    .length(6, "OTP must be exactly 6 digits.")
    .regex(/^\d{6}$/, "OTP must be a 6-digit number."),
  purpose: z.enum(["SIGNUP", "PASSWORD_RESET", "LOGIN"], {
    required_error: "Purpose is required.",
    invalid_type_error: "Purpose must be SIGNUP, PASSWORD_RESET, or LOGIN.",
  }),
});

const resendOtpSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .trim()
    .toLowerCase(),
  purpose: z.enum(["SIGNUP", "PASSWORD_RESET", "LOGIN"], {
    required_error: "Purpose is required.",
  }),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required." })
    .min(1, "Password is required."),
});

const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .trim()
    .toLowerCase(),
});

const resetPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .email("Please enter a valid email address.")
    .trim()
    .toLowerCase(),
  otp: z
    .string({ required_error: "OTP is required." })
    .length(6, "OTP must be exactly 6 digits.")
    .regex(/^\d{6}$/, "OTP must be a 6-digit number."),
  newPassword: z
    .string({ required_error: "New password is required." })
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be under 128 characters."),
});

module.exports = {
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
