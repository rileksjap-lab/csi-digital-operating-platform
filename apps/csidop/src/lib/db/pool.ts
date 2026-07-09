import { Pool, type PoolConfig } from "pg";

// In production DATABASE_URL points at PgBouncer (port 6432, transaction mode).
// In development it points at PostgreSQL directly (port 5432).
// PgBouncer transaction mode means: no session-level state (SET, LISTEN, named
// prepared statements) across separate queries — always use parameterised queries
// via $1/$2/... placeholders, which pg sends as simple Protocol messages.
const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Keep the application-side pool small: PgBouncer already multiplexes many
  // application connections onto a smaller server-side pool (SAD §16.1).
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

// Singleton pool — safe to import in multiple route files because Next.js
// module cache keeps this alive across requests within one server process.
// In development with Fast Refresh, HMR may recreate modules; the check below
// prevents opening a new pool on every hot-reload.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const pool: Pool = global.__pgPool ?? new Pool(config);

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

pool.on("error", (err) => {
  // Log but don't crash — the pool will re-connect automatically.
  console.error("[db] unexpected idle client error", err);
});

export default pool;

/** Parameterised query helper. Use $1, $2, … placeholders — never string interpolation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === "development") {
    console.debug("[db] query", { text, duration, rows: result.rowCount });
  }

  return result;
}
