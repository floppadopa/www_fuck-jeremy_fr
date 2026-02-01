export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool as dbPool } from "~/server/db-pool";

// DELETE /api/dbdiagram/table/[name] - Drop a table from the database
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Validate table name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return NextResponse.json(
      { error: "Invalid table name" },
      { status: 400 }
    );
  }

  // Protected tables that should never be deleted
  const protectedTables = [
    "_prisma_migrations",
    "schema_migrations",
  ];

  if (protectedTables.includes(name)) {
    return NextResponse.json(
      { error: "Cannot delete protected system table" },
      { status: 403 }
    );
  }

  try {
    // Check if table exists
    const checkResult = await dbPool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [name]
    );

    if (!checkResult.rows[0].exists) {
      return NextResponse.json(
        { error: "Table not found" },
        { status: 404 }
      );
    }

    // Drop the table with CASCADE to remove dependencies
    await dbPool.query(`DROP TABLE IF EXISTS "public"."${name}" CASCADE`);

    return NextResponse.json({ success: true, message: `Table '${name}' deleted` });
  } catch (error) {
    console.error("Error deleting table:", error);
    return NextResponse.json(
      { error: "Failed to delete table" },
      { status: 500 }
    );
  }
}

// GET /api/dbdiagram/table/[name] - Get table info
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  try {
    const result = await dbPool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [name]
    );

    return NextResponse.json({ table: name, columns: result.rows });
  } catch (error) {
    console.error("Error getting table info:", error);
    return NextResponse.json(
      { error: "Failed to get table info" },
      { status: 500 }
    );
  }
}
