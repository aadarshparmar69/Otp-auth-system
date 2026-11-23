const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;

module.exports = {
  hash: (value) => bcrypt.hash(value, SALT_ROUNDS),
  compare: (value, hash) => bcrypt.compare(value, hash),
};
