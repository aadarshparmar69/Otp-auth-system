function success(res, statusCode, message, data = null) {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
}

function error(res, statusCode, code, message) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

module.exports = { success, error };
