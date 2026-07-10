const bcrypt = require('bcryptjs');
const { getPool } = require('../config/db');

/**
 * User data access object (DAO) for MySQL operations.
 */
const User = {
  /**
   * Find a user by their email.
   * @param {string} email
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );
    return rows[0] || null;
  },

  /**
   * Find a user by their numeric ID.
   * @param {number|string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Create a new user with a hashed password.
   * @param {object} params
   * @param {string} params.name
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<object>} Created user metadata
   */
  async create({ name, email, password }) {
    const pool = getPool();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hashedPassword]
    );

    return {
      id: result.insertId,
      name,
      email,
    };
  },

  /**
   * Compare a candidate password with the hashed password.
   * @param {string} candidatePassword
   * @param {string} hashedPassword
   * @returns {Promise<boolean>}
   */
  async comparePassword(candidatePassword, hashedPassword) {
    return bcrypt.compare(candidatePassword, hashedPassword);
  },
};

module.exports = User;
