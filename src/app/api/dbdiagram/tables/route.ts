export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool as dbPool } from "~/server/db-pool";

// GET /api/dbdiagram/tables - List all tables
export async function GET() {
  try {
    const result = await dbPool.query(`
      SELECT 
        t.table_name,
        (SELECT COUNT(*) FROM information_schema.columns c 
         WHERE c.table_schema = 'public' AND c.table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE '_prisma%'
      ORDER BY t.table_name
    `);

    return NextResponse.json({ tables: result.rows });
  } catch (error) {
    console.error("Error listing tables:", error);
    return NextResponse.json(
      { error: "Failed to list tables" },
      { status: 500 }
    );
  }
}
