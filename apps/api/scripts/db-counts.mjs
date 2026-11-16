import dotenv from 'dotenv';
import { createConnection } from 'mysql2/promise';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const connection = await createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'campus',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'campus',
  decimalNumbers: true
});

const [tables] = await connection.query(
  `SELECT table_name AS name, table_rows AS rows_estimate
   FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
);
console.log('TABLES', tables.length);
console.table(tables);

const names = tables.map((row) => row.name).filter((name) => name !== 'schema_migrations');
for (const name of names) {
  const [[count]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${name}\``);
  console.log(`${name}: ${count.count}`);
}

await connection.end();
