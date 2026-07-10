const { getPool } = require('../config/db');

/**
 * File data access object (DAO) for MySQL operations.
 */
const File = {
  /**
   * Find file metadata by its numeric ID.
   * @param {number|string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, original_name AS originalName, file_name AS fileName, 
              mime_type AS mimeType, size, uploaded_by AS uploadedBy, 
              room_id AS roomId, created_at AS createdAt 
       FROM files WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows[0]) return null;

    // Attach _id duplicate for MongoDB-friendly React client compatibility
    return {
      ...rows[0],
      _id: rows[0].id,
    };
  },

  /**
   * Save file metadata to database.
   * @param {object} params
   * @param {string} params.originalName
   * @param {string} params.fileName
   * @param {string} params.mimeType
   * @param {number} params.size
   * @param {number|string} params.uploadedBy
   * @param {string} params.roomId
   * @returns {Promise<object>} Created file record
   */
  async create({ originalName, fileName, mimeType, size, uploadedBy, roomId }) {
    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO files (original_name, file_name, mime_type, size, uploaded_by, room_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [originalName, fileName, mimeType, size, uploadedBy, roomId]
    );

    return {
      id: result.insertId,
      _id: result.insertId, // MongoDB client fallback
      originalName,
      fileName,
      mimeType,
      size,
      uploadedBy,
      roomId,
    };
  },
};

module.exports = File;
