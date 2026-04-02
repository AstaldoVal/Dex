declare module "sql.js" {
  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJs>;
  interface SqlJs {
    Database: new (data?: Buffer | Uint8Array) => SqlDatabase;
  }
  interface SqlDatabase {
    exec(sql: string): QueryExecResult[];
    close(): void;
  }
  interface QueryExecResult {
    columns: string[];
    values: (string | number | Uint8Array | null)[][];
  }
}
