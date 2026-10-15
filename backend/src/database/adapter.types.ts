export type DatabaseError = (Error & {
    code?: string;
    postgresCode?: string;
}) | null;
export type RunResult = {
    lastID: number;
    changes: number;
};
export interface ApplicationDatabase {
    ping?: () => Promise<void>;
    run(sql: string, callback?: (this: RunResult, error: DatabaseError) => void): this;
    run(sql: string, params: any[], callback?: (this: RunResult, error: DatabaseError) => void): this;
    get(sql: string, callback: (error: DatabaseError, row: any) => void): this;
    get(sql: string, params: any[], callback: (error: DatabaseError, row: any) => void): this;
    all(sql: string, callback: (error: DatabaseError, rows: any[]) => void): this;
    all(sql: string, params: any[], callback: (error: DatabaseError, rows: any[]) => void): this;
    serialize(callback: () => void): void;
    close(callback?: (error: DatabaseError) => void): void;
}
