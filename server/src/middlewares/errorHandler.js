const { error } = require("../utils/responseEnvelope");

module.exports = (err, req, res, _next) => {
  console.error("Unhandled error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  if (err.code === 11000) {
    return error(res, 409, "EMAIL_EXISTS", "An account with this email already exists.");
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return error(res, 401, "TOKEN_INVALID", "Invalid or expired token.");
  }

  if (err.name === "ZodError") {
    return error(res, 400, "VALIDATION_ERROR", err.errors[0]?.message || "Invalid input.");
  }

  return error(res, 500, "SERVER_ERROR", "Something went wrong. Please try again.");
};
