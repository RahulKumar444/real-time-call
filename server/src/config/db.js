const mysql = require('mysql2/promise');

let pool = null;

/**
 * Connect to MySQL, verify database and table existence, and initialize the connection pool.
 */
async function connectDB() {
  const connectionConfig = {
    host:     process.env.DB_HOST || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT, 10) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
  };

  const dbName = process.env.DB_NAME || 'rtc_app';

  try {
    // 1. Create connection to host directly to verify connectivity and create the database if not exists
    const tempConn = await mysql.createConnection(connectionConfig);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConn.end();
    console.log(`✅ Database "${dbName}" ensured/created.`);

    // 2. Initialize connection pool to the database
    pool = mysql.createPool({
      ...connectionConfig,
      database:           dbName,
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      charset:            'utf8mb4',
    });

    // 3. Test pool connection
    const conn = await pool.getConnection();
    console.log('✅ MySQL pool connected successfully');
    conn.release();

    // 4. Create Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size INT UNSIGNED NOT NULL,
        uploaded_by INT UNSIGNED NOT NULL,
        room_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_files_uploaded_by
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('✅ MySQL tables verified/created.');
  } catch (err) {
    console.error(`❌ MySQL connection/setup failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Return the current initialized pool instance.
 */
function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectDB first.');
  }
  return pool;
}

module.exports = {
  connectDB,
  getPool,
};
