const { error } = require("../utils/responseEnvelope");

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      return error(res, 400, "VALIDATION_ERROR", firstError.message);
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
