import 'dotenv/config';
import type { ApplicationDatabase } from './adapter.types';
const client = String(process.env.DB_CLIENT || 'sqlite').trim().toLowerCase();
if (!['sqlite', 'postgres'].includes(client))
    throw new Error('DB_CLIENT deve ser sqlite ou postgres.');
let db: ApplicationDatabase;
let bancoPronto: Promise<void>;
if (client === 'postgres') {
    const { PostgresDatabase } = require('./postgres') as typeof import('./postgres');
    const postgres = new PostgresDatabase();
    db = postgres;
    bancoPronto = postgres.ready;
}
else {
    const sqlite = require('./sqlite') as typeof import('./sqlite');
    db = sqlite.default as ApplicationDatabase;
    bancoPronto = sqlite.bancoPronto;
}
export { bancoPronto };
export const bancoCliente = client;
export default db;
