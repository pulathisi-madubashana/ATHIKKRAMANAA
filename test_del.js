const fs = require('fs');
const path = require('path');
const AUTH_DIR = path.join(__dirname, 'auth');
console.log("Files before delete:", fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR).length : 0);
try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log("Delete succeeded");
} catch(e) {
    console.log("Delete failed:", e.message);
}
console.log("Files after delete:", fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR).length : 0);
