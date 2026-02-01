import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { pool as dbPool } from "~/server/db-pool";
import type { Prisma } from "@prisma/client";

// Force Node.js runtime for raw SQL queries
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TableInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  constraint_type: string | null;
  constraint_name: string | null;
}

interface ForeignKeyInfo {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
  delete_rule: string;
}

interface IndexInfo {
  table_name: string;
  index_name: string;
  column_name: string;
  is_unique: boolean;
}

interface DiagramTable {
  name: string;
  schemaName: string;
  x: number;
  y: number;
}

interface DiagramData {
  tables: DiagramTable[];
}

/**
 * Get diagram config from database
 */
async function getDiagramConfig(slug: string) {
  try {
    const config = await db.diagramConfig.findUnique({
      where: { slug },
    });

    if (!config) return null;

    return {
      _id: slug,
      content: config.content,
      userid: config.userid,
      name: config.name,
      diagram: config.diagram as unknown as DiagramData,
      tableGroups: config.tableGroups,
      referencePaths: config.referencePaths,
      detailLevel: config.detailLevel,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("[Sync API] Error fetching diagram config:", error);
    return null;
  }
}

/**
 * Save diagram config to database
 */
async function saveDiagramConfig(
  slug: string,
  data: {
    content: string;
    userid: string;
    name: string;
    diagram: DiagramData;
    tableGroups: unknown[];
    referencePaths: unknown[];
    detailLevel: string;
  }
) {
  try {
    const result = await db.diagramConfig.upsert({
      where: { slug },
      create: {
        slug,
        content: data.content,
        userid: data.userid,
        name: data.name,
        diagram: data.diagram as unknown as Prisma.InputJsonValue,
        tableGroups: data.tableGroups as unknown as Prisma.InputJsonValue,
        referencePaths: data.referencePaths as unknown as Prisma.InputJsonValue,
        detailLevel: data.detailLevel,
      },
      update: {
        content: data.content,
        userid: data.userid,
        name: data.name,
        diagram: data.diagram as unknown as Prisma.InputJsonValue,
        tableGroups: data.tableGroups as unknown as Prisma.InputJsonValue,
        referencePaths: data.referencePaths as unknown as Prisma.InputJsonValue,
        detailLevel: data.detailLevel,
      },
    });

    console.log(
      "[Sync API] ✓ Diagram config saved to database (id:",
      result.id,
      ")"
    );
    return true;
  } catch (error) {
    console.error("[Sync API] Error saving diagram config:", error);
    return false;
  }
}

function mapPostgresTypeToDbml(pgType: string): string {
  const typeMap: Record<string, string> = {
    integer: "Int",
    bigint: "BigInt",
    smallint: "Int",
    serial: "Int",
    bigserial: "BigInt",
    "character varying": "String",
    varchar: "String",
    text: "String",
    boolean: "Boolean",
    "timestamp without time zone": "DateTime",
    "timestamp with time zone": "DateTime",
    timestamp: "DateTime",
    date: "DateTime",
    "double precision": "Float",
    real: "Float",
    numeric: "Float",
    json: "Json",
    jsonb: "Json",
    uuid: "String",
    bytea: "Bytes",
    ARRAY: "String[]",
  };

  // Handle array types
  if (pgType.endsWith("[]") || pgType.startsWith("_")) {
    return "String[]";
  }

  return typeMap[pgType.toLowerCase()] || "String";
}

function generateDbmlFromSchema(
  tables: Map<string, TableInfo[]>,
  foreignKeys: ForeignKeyInfo[],
  indexes: Map<string, IndexInfo[]>
): string {
  const lines: string[] = [];
  lines.push("// Database Schema - Auto-generated from Supabase");
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push("");

  // Generate table definitions
  for (const [tableName, columns] of tables) {
    lines.push(`Table ${tableName} {`);

    for (const col of columns) {
      const dbmlType = mapPostgresTypeToDbml(col.data_type);
      const attrs: string[] = [];

      // Primary key
      if (col.constraint_type === "PRIMARY KEY") {
        attrs.push("pk");
        if (col.column_default?.includes("nextval")) {
          attrs.push("increment");
        }
      }

      // Unique constraint
      if (col.constraint_type === "UNIQUE") {
        attrs.push("unique");
      }

      // Not null
      if (col.is_nullable === "NO" && col.constraint_type !== "PRIMARY KEY") {
        attrs.push("not null");
      }

      // Default value
      if (col.column_default && !col.column_default.includes("nextval")) {
        const defaultVal = col.column_default
          .replace(/::[\w\s[\]]+$/, "") // Remove type cast
          .replace(/^'(.*)'$/, '"$1"'); // Convert single quotes to double
        if (defaultVal === "now()") {
          attrs.push("`now()`");
        } else if (defaultVal === "gen_random_uuid()") {
          attrs.push("`gen_random_uuid()`");
        } else if (defaultVal !== "") {
          attrs.push(`default: ${defaultVal}`);
        }
      }

      const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
      lines.push(`  ${col.column_name} ${dbmlType}${attrStr}`);
    }

    // Add indexes for this table
    const tableIndexes = indexes.get(tableName);
    if (tableIndexes && tableIndexes.length > 0) {
      // Group indexes by name
      const indexGroups = new Map<string, IndexInfo[]>();
      for (const idx of tableIndexes) {
        const existing = indexGroups.get(idx.index_name) || [];
        existing.push(idx);
        indexGroups.set(idx.index_name, existing);
      }

      lines.push("");
      lines.push("  indexes {");
      for (const [indexName, idxCols] of indexGroups) {
        // Skip primary key indexes
        if (indexName.endsWith("_pkey")) continue;

        const colNames = idxCols.map((i) => i.column_name);
        const isUnique = idxCols[0]?.is_unique;

        if (colNames.length === 1) {
          lines.push(`    ${colNames[0]}${isUnique ? " [unique]" : ""}`);
        } else {
          lines.push(
            `    (${colNames.join(", ")})${isUnique ? " [unique]" : ""}`
          );
        }
      }
      lines.push("  }");
    }

    lines.push("}");
    lines.push("");
  }

  // Generate relationships
  if (foreignKeys.length > 0) {
    lines.push("// Relationships");
    for (const fk of foreignKeys) {
      const deleteRule =
        fk.delete_rule === "CASCADE" ? " [delete: cascade]" : "";
      lines.push(
        `Ref: ${fk.table_name}.${fk.column_name} > ${fk.foreign_table_name}.${fk.foreign_column_name}${deleteRule}`
      );
    }
  }

  return lines.join("\n");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    console.log("[Sync API] Starting database schema sync for slug:", slug);

    // Query all tables and columns from information_schema
    const columnsQuery = await dbPool.query<TableInfo>(`
      SELECT 
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        tc.constraint_type,
        tc.constraint_name
      FROM information_schema.columns c
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON c.table_name = ccu.table_name 
        AND c.column_name = ccu.column_name
        AND c.table_schema = ccu.table_schema
      LEFT JOIN information_schema.table_constraints tc 
        ON ccu.constraint_name = tc.constraint_name
        AND tc.table_schema = c.table_schema
        AND (tc.constraint_type = 'PRIMARY KEY' OR tc.constraint_type = 'UNIQUE')
      WHERE c.table_schema = 'public'
        AND c.table_name NOT LIKE '_prisma%'
        AND c.table_name NOT LIKE 'pg_%'
      ORDER BY c.table_name, c.ordinal_position
    `);
    const columnsResult = columnsQuery.rows;

    // Query foreign keys
    const foreignKeysQuery = await dbPool.query<ForeignKeyInfo>(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);
    const foreignKeysResult = foreignKeysQuery.rows;

    // Query indexes
    const indexesQuery = await dbPool.query<IndexInfo>(`
      SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relkind = 'r'
        AND NOT ix.indisprimary
      ORDER BY t.relname, i.relname
    `);
    const indexesResult = indexesQuery.rows;

    // Group columns by table
    const tables = new Map<string, TableInfo[]>();
    for (const row of columnsResult) {
      const existing = tables.get(row.table_name) || [];
      // Avoid duplicates from multiple constraints
      if (!existing.find((c) => c.column_name === row.column_name)) {
        existing.push(row);
      } else if (row.constraint_type === "PRIMARY KEY") {
        // Update to mark as primary key
        const idx = existing.findIndex(
          (c) => c.column_name === row.column_name
        );
        if (idx >= 0) {
          existing[idx] = row;
        }
      }
      tables.set(row.table_name, existing);
    }

    // Group indexes by table
    const indexes = new Map<string, IndexInfo[]>();
    for (const row of indexesResult) {
      const existing = indexes.get(row.table_name) || [];
      existing.push(row);
      indexes.set(row.table_name, existing);
    }

    // Generate DBML content
    const dbmlContent = generateDbmlFromSchema(
      tables,
      foreignKeysResult,
      indexes
    );

    console.log(
      `[Sync API] Generated DBML with ${tables.size} tables and ${foreignKeysResult.length} relationships`
    );

    // Get existing config from database to preserve positions
    const existingData = await getDiagramConfig(slug);

    // Build table positions map from existing data
    const existingPositions = new Map<string, { x: number; y: number }>();
    if (existingData?.diagram?.tables) {
      for (const t of existingData.diagram.tables) {
        existingPositions.set(t.name, { x: t.x, y: t.y });
      }
    }

    // Create new tables array with positions
    const newTables: DiagramTable[] = [];
    let xOffset = 50;
    let yOffset = 50;
    const COL_WIDTH = 300;
    const ROW_HEIGHT = 250;
    let colCount = 0;

    for (const tableName of tables.keys()) {
      const existingPos = existingPositions.get(tableName);
      if (existingPos) {
        newTables.push({
          name: tableName,
          schemaName: "public",
          x: existingPos.x,
          y: existingPos.y,
        });
      } else {
        // Auto-position new tables
        newTables.push({
          name: tableName,
          schemaName: "public",
          x: xOffset,
          y: yOffset,
        });
        xOffset += COL_WIDTH;
        colCount++;
        if (colCount >= 5) {
          colCount = 0;
          xOffset = 50;
          yOffset += ROW_HEIGHT;
        }
      }
    }

    // Save to database
    const updateData = {
      content: dbmlContent,
      userid: existingData?.userid || "openleviator",
      name: existingData?.name || "OpenLeviator Dashboard",
      diagram: {
        tables: newTables,
      },
      tableGroups: (existingData?.tableGroups as unknown[]) || [],
      referencePaths: (existingData?.referencePaths as unknown[]) || [],
      detailLevel: existingData?.detailLevel || "All",
    };

    const saved = await saveDiagramConfig(slug, updateData);

    if (saved) {
      console.log("[Sync API] Successfully synced database schema");
      return NextResponse.json({
        success: true,
        tables: tables.size,
        relationships: foreignKeysResult.length,
        message: "Schema synced successfully",
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Failed to save" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Sync API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
