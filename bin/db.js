const config = require('../../config');
const mysql = require('mysql2/promise');

// Build the pool once (module singleton)
const pool = mysql.createPool({
    ...config.databases.resqzone_db,
    // sane defaults (in case they’re not in config)
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 15000,
    // quality of life:
    decimalNumbers: true, // numbers as JS numbers
    dateStrings: true, // dates as strings (avoid TZ surprises)
    // namedPlaceholders: true,   // enable if you want :name params
});

// Simple helper with a one‑time retry for transient errors
function isTransient(err) {
    const m = String((err && err.message) || '');
    return /PROTOCOL_CONNECTION_LOST|ECONNRESET|closed state|read ECONNRESET|ETIMEDOUT/i.test(m);
}

async function query(sql, params, retries = 1) {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (e) {
        if (retries > 0 && isTransient(e)) {
            console.warn('[DB] transient error, retrying once:', e.message);
            return query(sql, params, retries - 1);
        }
        throw e;
    }
}

// Transactions when needed
async function withTransaction(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn); // use conn.execute inside fn
        await conn.commit();
        return result;
    } catch (e) {
        try {
            await conn.rollback();
        } catch {}
        throw e;
    } finally {
        conn.release();
    }
}

// Optional: keep the pool warm on sleepy hosts
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
    } catch (e) {
        console.error('[DB] ping failed:', e.message);
    }
}, 5 * 60 * 1000);

process.on('SIGINT', async () => {
    try {
        await pool.end();
    } finally {
        process.exit(0);
    }
});
process.on('SIGTERM', async () => {
    try {
        await pool.end();
    } finally {
        process.exit(0);
    }
});

module.exports = { pool, query, withTransaction };
