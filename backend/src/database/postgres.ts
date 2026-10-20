import { Pool, PoolClient, QueryResult, types } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import type { ApplicationDatabase, DatabaseError, RunResult } from './adapter.types';
import { postgresSql } from './sql-dialect';
type Column = {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    cid: number;
};
type Contract = {
    tables: {
        name: string;
        identityColumn: string | null;
        columns: {
            name: string;
        }[];
    }[];
};
// Stable app-specific int32 keys shared by every serverless instance. Transaction
// writes use one database lock to preserve the SQLite BEGIN IMMEDIATE ordering.
const TRANSACTION_LOCK_KEYS = [0x4e4f5353, 0x4f4d4552];
types.setTypeParser(20, value => { const n = Number(value); if (!Number.isSafeInteger(n))
    throw new Error('Identificador PostgreSQL fora do intervalo seguro do JavaScript.'); return n; });
types.setTypeParser(1700, value => { const n = Number(value); if (!Number.isFinite(n))
    throw new Error('Valor PostgreSQL não finito.'); return n; });
export function postgresConfig() {
    if (!process.env.DATABASE_URL)
        throw new Error('DATABASE_URL é obrigatória com DB_CLIENT=postgres.');
    let url: URL;
    try {
        url = new URL(process.env.DATABASE_URL);
    }
    catch {
        throw new Error('DATABASE_URL inválida. Confira o formato da conexão PostgreSQL.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
        throw new Error('DATABASE_URL deve usar PostgreSQL.');
    const mode = process.env.PG_SSL || 'require';
    if (!['require', 'disable'].includes(mode))
        throw new Error('PG_SSL deve ser require ou disable.');
    if (mode === 'disable' && (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production'))
        throw new Error('PG_SSL=disable é permitido somente em PostgreSQL local de desenvolvimento/teste.');
    // URI SSL parameters must not silently replace the explicit verified TLS configuration.
    // pg-connection-string also accepts ssl=0, options and host overrides. Keep
    // security/session settings exclusively in the explicit application config.
    url.search = '';
    // Hosted environments can supply the PEM directly, without a machine-local file.
    const ca = process.env.PG_SSL_CA
        ? process.env.PG_SSL_CA.replace(/\\n/g, '\n')
        : process.env.PG_SSL_CA_FILE ? fs.readFileSync(path.resolve(process.env.PG_SSL_CA_FILE), 'utf8') : undefined;
    return { connectionString: url.toString(), ssl: mode === 'disable' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, application_name: 'nosso-mercadinho-api', connectionTimeoutMillis: 15000,
        options: '-c timezone=UTC -c search_path=public,pg_catalog', max: 1, idleTimeoutMillis: 10000, allowExitOnIdle: true };
}
function normalizeError(error: unknown): DatabaseError {
    const original = error as Error & {
        code?: string;
    };
    if (['23505', '23503', '23514', '23502'].includes(original.code || '')) {
        const normalized = new Error(original.code === '23505' ? `UNIQUE constraint failed: ${original.message}` : original.message) as NonNullable<DatabaseError>;
        normalized.code = 'SQLITE_CONSTRAINT';
        normalized.postgresCode = original.code;
        return normalized;
    }
    return original;
}
/** A pool of one preserves transaction ordering and can reconnect without replaying writes. */
export class PostgresDatabase implements ApplicationDatabase {
    private pool: Pool;
    private columns = new Map<string, Column[]>();
    private identities = new Map<string, string>();
    private transactionClient: PoolClient | undefined;
    private transactionError: Error | undefined;
    readonly ready: Promise<void>;
    constructor() {
        this.pool = new Pool(postgresConfig());
        this.pool.on('error', error => { console.error('Conexão PostgreSQL interrompida:', error.message); });
        this.ready = this.prepare();
    }
    private async prepare() {
        const result = await this.pool.query(`SELECT table_name,column_name,data_type,is_nullable,column_default,
      ordinal_position,is_identity FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`);
        for (const row of result.rows) {
            const list = this.columns.get(row.table_name) || [];
            list.push({ cid: Number(row.ordinal_position) - 1, name: row.column_name, type: row.data_type, notnull: row.is_nullable === 'NO' ? 1 : 0, dflt_value: row.column_default, pk: row.is_identity === 'YES' ? 1 : 0 });
            this.columns.set(row.table_name, list);
            if (row.is_identity === 'YES')
                this.identities.set(row.table_name, row.column_name);
        }
        // ts-node reads the source contract; deployed JavaScript must contain its
        // build asset instead of relying on the repository or working directory.
        const contractPath = __filename.endsWith('.ts')
            ? path.resolve(__dirname, '../../../supabase/schema-contract.json')
            : path.resolve(__dirname, '../schema-contract.json');
        if (!fs.existsSync(contractPath))
            throw new Error('schema-contract.json ausente no pacote da API. Execute o build completo do backend.');
        const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Contract;
        const missing: string[] = [];
        for (const table of contract.tables)
            for (const column of table.columns)
                if (!this.columns.get(table.name)?.some(c => c.name === column.name))
                    missing.push(`${table.name}.${column.name}`);
        if (missing.length)
            throw new Error(`PostgreSQL sem as migrations do projeto. Aplique supabase/migrations antes de iniciar. Colunas ausentes: ${missing.slice(0, 8).join(', ')}.`);
        console.log('PostgreSQL conectado; esquema do projeto validado.');
    }
    private async execute(sql: string, params: any[] = []): Promise<{
        rows: any[];
        changes: number;
        lastID: number;
    }> {
        await this.ready;
        const pragma = sql.trim().match(/^PRAGMA\s+table_info\s*\(\s*['"]?([\w]+)['"]?\s*\)\s*;?$/i);
        if (pragma)
            return { rows: this.columns.get(pragma[1]) || [], changes: 0, lastID: 0 };
        if (/^\s*PRAGMA\s+foreign_keys\s*=/i.test(sql))
            return { rows: [], changes: 0, lastID: 0 };
        const tableDdl = sql.match(/^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([\w]+)/i);
        const indexDdl = sql.match(/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+[\w]+\s+ON\s+([\w]+)/i);
        const alter = sql.match(/^\s*ALTER\s+TABLE\s+([\w]+)\s+ADD\s+COLUMN\s+([\w]+)/i);
        if (tableDdl || indexDdl || alter) {
            const table = (tableDdl || indexDdl || alter)![1];
            if (!this.columns.has(table) || alter && !this.columns.get(table)!.some(c => c.name === alter[2]))
                throw new Error(`Migration PostgreSQL ausente para ${table}${alter ? '.' + alter[2] : ''}. A API não altera o esquema de produção.`);
            return { rows: [], changes: 0, lastID: 0 };
        }
        if (/^\s*(CREATE|ALTER|DROP|PRAGMA)\b/i.test(sql))
            throw new Error('DDL não suportado no runtime PostgreSQL. Use as migrations do projeto.');
        let translated = postgresSql(sql).trim().replace(/;$/, '');
        const insert = translated.match(/^INSERT\s+INTO\s+([\w]+)/i);
        const identity = insert && this.identities.get(insert[1]);
        if (identity && !/\bRETURNING\b/i.test(translated))
            translated += ` RETURNING "${identity}"`;
        try {
            const result = await this.queryStatement(translated, params.map(v => v === undefined ? null : v));
            return { rows: result.rows, changes: result.rowCount || 0, lastID: identity && result.rows.length ? Number(result.rows[result.rows.length - 1][identity]) : 0 };
        }
        catch (error) {
            throw normalizeError(error);
        }
    }
    private async queryStatement(sql: string, params: any[]): Promise<QueryResult> {
        if (/^BEGIN(?:\s|$)/i.test(sql)) {
            if (this.transactionClient)
                throw new Error('Já existe uma transação nesta conexão.');
            const client = await this.pool.connect();
            this.transactionClient = client;
            this.transactionError = undefined;
            client.on('error', this.onTransactionError);
            try {
                const result = await client.query(sql, params);
                await client.query('SELECT pg_advisory_xact_lock($1, $2)', TRANSACTION_LOCK_KEYS);
                return result;
            }
            catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                this.releaseTransaction(true);
                throw error;
            }
        }
        const client = this.transactionClient;
        if (client) {
            const closing = /^(COMMIT|ROLLBACK)(?:\s|$)/i.test(sql);
            try {
                if (this.transactionError)
                    throw this.transactionError;
                return await client.query(sql, params);
            }
            finally {
                if (closing)
                    this.releaseTransaction(Boolean(this.transactionError));
            }
        }
        return this.pool.query(sql, params);
    }
    private onTransactionError = (error: Error) => { this.transactionError = error; };
    private releaseTransaction(discard: boolean) {
        const client = this.transactionClient;
        this.transactionClient = undefined;
        this.transactionError = undefined;
        if (client) {
            client.removeListener('error', this.onTransactionError);
            client.release(discard);
        }
    }
    run(sql: string, paramsOrCallback: any[] | ((this: RunResult, error: DatabaseError) => void) = [], callback?: (this: RunResult, error: DatabaseError) => void): this {
        const done = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback, params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
        this.execute(sql, params).then(result => done?.call(result, null), error => { if (done)
            done.call({ lastID: 0, changes: 0 }, normalizeError(error));
        else
            console.error('Falha na consulta PostgreSQL:', (error as Error).message); });
        return this;
    }
    get(sql: string, paramsOrCallback: any[] | ((error: DatabaseError, row: any) => void), callback?: (error: DatabaseError, row: any) => void): this {
        const done = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback!;
        this.execute(sql, Array.isArray(paramsOrCallback) ? paramsOrCallback : []).then(r => done(null, r.rows[0]), e => done(normalizeError(e), undefined));
        return this;
    }
    all(sql: string, paramsOrCallback: any[] | ((error: DatabaseError, rows: any[]) => void), callback?: (error: DatabaseError, rows: any[]) => void): this {
        const done = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback!;
        this.execute(sql, Array.isArray(paramsOrCallback) ? paramsOrCallback : []).then(r => done(null, r.rows), e => done(normalizeError(e), []));
        return this;
    }
    serialize(callback: () => void) { callback(); }
    async ping() { await this.ready; await this.queryStatement('SELECT 1', []); }
    close(callback?: (error: DatabaseError) => void) { this.releaseTransaction(true); this.ready.catch(() => undefined).then(() => this.pool.end()).then(() => callback?.(null), e => callback?.(normalizeError(e))); }
}
