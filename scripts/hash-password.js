// Usage: npm run hash-password -- "your new password"
// Prints the value to put in ADMIN_PASSWORD_HASH (Vercel env vars and .env.local).
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw) { console.error('Usage: npm run hash-password -- "your new password"'); process.exit(1); }
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 32);
console.log(`scrypt:${salt.toString('hex')}:${hash.toString('hex')}`);
