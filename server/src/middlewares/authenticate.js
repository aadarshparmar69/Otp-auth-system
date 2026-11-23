const { verifyAccessToken } = require("../utils/tokens");
const { error } = require("../utils/responseEnvelope");

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return error(res, 401, "UNAUTHORIZED", "Authentication required.");
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    return error(res, 401, "UNAUTHORIZED", "Invalid or expired access token.");
  }
}

module.exports = authenticate;
