import { env } from "~/env";
import { Pool } from "pg";

// Standalone pool for raw SQL queries (no Prisma initialization)
const globalForPool = globalThis as unknown as {
  pool: Pool | undefined;
};

export const pool =
  globalForPool.pool ??
  new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") globalForPool.pool = pool;
