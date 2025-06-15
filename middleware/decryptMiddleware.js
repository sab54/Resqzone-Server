const crypto = require('crypto');
const Config = require('../../config');

const ENCRYPTION_KEY = Config.domains.resqzone_api.ENCRYPTION_KEY; // Must be 32 characters (256 bits)
const IV_LENGTH = Config.domains.resqzone_api.IV_LENGTH || 16;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 characters long (AES-256 key)');
}

function decrypt(encryptedInput) {
    //console.log('encryptedInput: ', encryptedInput);
    const parts = encryptedInput.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted format');

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');

    const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        Buffer.from(ENCRYPTION_KEY),
        iv
    );

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    console.log('decrypted: output', decrypted.toString());
    return decrypted.toString();
}

module.exports = (req, res, next) => {
    try {
        // 📦 Decrypt JSON body if present
        if (
            req.is('application/json') &&
            typeof req.body === 'object' &&
            req.body.payload
        ) {
            const decrypted = decrypt(req.body.payload);
            req.body = JSON.parse(decrypted);
        }

        // 🔓 Decrypt query payload for all methods that might send encrypted query
        const methodAllowsQueryPayload = ['GET', 'DELETE', 'HEAD']; // Add others if needed
        if (
            methodAllowsQueryPayload.includes(req.method) &&
            req.query?.payload
        ) {
            const decrypted = decrypt(req.query.payload);
            req.query = JSON.parse(decrypted);
        }

        next();
    } catch (err) {
        console.error('❌ Decryption error:', err.message);
        return res.status(400).json({
            success: false,
            error: 'Invalid encrypted payload',
        });
    }
};
