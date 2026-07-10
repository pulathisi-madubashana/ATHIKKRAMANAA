const mysql = require('mysql2/promise');

const passwords = ['', 'root', 'admin', 'password', 'mysql', '12345678', '123456', '1234'];
const host = 'localhost';
const user = 'root';
const port = 3306;

async function bruteForce() {
  console.log('Testing common passwords for MySQL user "root"...');
  for (const pw of passwords) {
    try {
      const connection = await mysql.createConnection({ host, user, port, password: pw });
      console.log(`\n✔ SUCCESS! Connection succeeded with password: "${pw}"`);
      await connection.end();
      return;
    } catch (err) {
      console.log(`Failed with password: "${pw}" (${err.code})`);
    }
  }
  console.log('\n❌ None of the common passwords worked.');
}

bruteForce();
