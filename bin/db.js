const config = require('../../config');
const mysql = require('mysql2/promise');

module.exports = async (db) => {
    if (db === 'resqzone_db') {
        let connection;
        try {
            connection = await mysql.createConnection(
                config.databases.resqzone_db
            );
            console.log('Main DB Connected');

            // Attach a close method for manual cleanup
            connection.close = async () => {
                try {
                    await connection.end();
                    console.log('Main DB Connection Closed');
                } catch (closeErr) {
                    console.error(
                        'Error closing DB connection:',
                        closeErr.message
                    );
                }
            };

            return connection;
        } catch (err) {
            console.error('Cannot Connect to DB:', err.message);
            throw err;
        }
    }

    throw new Error(`Unknown DB identifier: ${db}`);
};
