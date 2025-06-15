// middleware/encryptMiddleware.js
const crypto = require('crypto');
const Config = require('../../config');

const ENCRYPTION_KEY = Config.domains.resqzone_api.ENCRYPTION_KEY; // Must be 32 chars
const IV_LENGTH = Config.domains.resqzone_api.IV_LENGTH || 16; // 16 bytes default for AES-CBC

// Validate encryption key length
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 characters long (AES-256)');
}

// Validate IV length
if (typeof IV_LENGTH !== 'number' || IV_LENGTH < 12 || IV_LENGTH > 32) {
    throw new Error('IV_LENGTH must be a number between 12–32');
}

function encrypt(plainText) {
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        Buffer.from(ENCRYPTION_KEY),
        iv
    );

    let encrypted = cipher.update(plainText, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

module.exports = (req, res, next) => {
    const originalJson = res.json;

    res.json = (data) => {
        try {
            const jsonString = JSON.stringify(data);
            const encrypted = encrypt(jsonString);

            return originalJson.call(res, {
                payload: encrypted,
            });
        } catch (err) {
            console.error('❌ Encryption error:', err.message);

            return originalJson.call(res, {
                success: false,
                error: 'Failed to encrypt response',
            });
        }
    };

    next();
};
