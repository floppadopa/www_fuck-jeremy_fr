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
    console.error("[API] Error fetching diagram config:", error);
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
    
    console.log("[API] ✓ Diagram config saved to database (id:", result.id, ")");
    return true;
  } catch (error) {
    console.error("[API] Error saving diagram config:", error);
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
  lines.push("// Database Schema - Auto-synced from Supabase");
  lines.push(`// Last synced: ${new Date().toISOString()}`);
  lines.push("");

  for (const [tableName, columns] of tables) {
    lines.push(`Table ${tableName} {`);

    for (const col of columns) {
      const dbmlType = mapPostgresTypeToDbml(col.data_type);
      const attrs: string[] = [];

      if (col.constraint_type === "PRIMARY KEY") {
        attrs.push("pk");
        if (col.column_default?.includes("nextval")) {
          attrs.push("increment");
        }
      }

      if (col.constraint_type === "UNIQUE") {
        attrs.push("unique");
      }

      if (col.is_nullable === "NO" && col.constraint_type !== "PRIMARY KEY") {
        attrs.push("not null");
      }

      if (col.column_default && !col.column_default.includes("nextval")) {
        let defaultVal = col.column_default
          .replace(/::[\w\s[\]"]+$/g, "")
          .trim();

        if (
          defaultVal === "now()" ||
          defaultVal === "CURRENT_TIMESTAMP" ||
          defaultVal.includes("now()")
        ) {
          attrs.push("default: `now()`");
        } else if (defaultVal === "gen_random_uuid()") {
          attrs.push("default: `gen_random_uuid()`");
        } else if (
          defaultVal === "ARRAY[]" ||
          defaultVal === "'{}'" ||
          defaultVal === "{}"
        ) {
          // Skip empty array defaults
        } else if (defaultVal === "true" || defaultVal === "false") {
          attrs.push(`default: ${defaultVal}`);
        } else if (/^-?\d+(\.\d+)?$/.test(defaultVal)) {
          attrs.push(`default: ${defaultVal}`);
        } else if (defaultVal.startsWith("'") && defaultVal.endsWith("'")) {
          const strVal = defaultVal.slice(1, -1);
          attrs.push(`default: "${strVal}"`);
        } else if (defaultVal !== "" && !defaultVal.includes("(")) {
          attrs.push(`default: "${defaultVal}"`);
        }
      }

      const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
      lines.push(`  ${col.column_name} ${dbmlType}${attrStr}`);
    }

    const tableIndexes = indexes.get(tableName);
    if (tableIndexes && tableIndexes.length > 0) {
      const indexGroups = new Map<string, IndexInfo[]>();
      for (const idx of tableIndexes) {
        const existing = indexGroups.get(idx.index_name) || [];
        existing.push(idx);
        indexGroups.set(idx.index_name, existing);
      }

      const validIndexes = Array.from(indexGroups.entries()).filter(
        ([name]) => !name.endsWith("_pkey")
      );

      if (validIndexes.length > 0) {
        lines.push("");
        lines.push("  indexes {");
        for (const [, idxCols] of validIndexes) {
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
    }

    lines.push("}");
    lines.push("");
  }

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

async function syncDatabaseSchema(slug: string): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    console.log("[Sync] Syncing schema from Supabase for slug:", slug);

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

    const tables = new Map<string, TableInfo[]>();
    for (const row of columnsResult) {
      const existing = tables.get(row.table_name) || [];
      if (!existing.find((c) => c.column_name === row.column_name)) {
        existing.push(row);
      } else if (row.constraint_type === "PRIMARY KEY") {
        const idx = existing.findIndex(
          (c) => c.column_name === row.column_name
        );
        if (idx >= 0) {
          existing[idx] = row;
        }
      }
      tables.set(row.table_name, existing);
    }

    const indexes = new Map<string, IndexInfo[]>();
    for (const row of indexesResult) {
      const existing = indexes.get(row.table_name) || [];
      existing.push(row);
      indexes.set(row.table_name, existing);
    }

    const dbmlContent = generateDbmlFromSchema(
      tables,
      foreignKeysResult,
      indexes
    );

    console.log(
      `[Sync] Generated DBML: ${tables.size} tables, ${foreignKeysResult.length} relationships`
    );

    // Get existing config from database to preserve positions
    const existingData = await getDiagramConfig(slug);

    const existingPositions = new Map<string, { x: number; y: number }>();
    if (existingData?.diagram?.tables) {
      for (const t of existingData.diagram.tables) {
        existingPositions.set(t.name, { x: t.x, y: t.y });
      }
    }

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

    const updatedData = {
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

    // Save to database
    await saveDiagramConfig(slug, updatedData);
    console.log("[Sync] Schema synced successfully");

    return {
      success: true,
      data: {
        _id: slug,
        ...updatedData,
        createdAt: existingData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[Sync] Error syncing schema:", error);
    const existingData = await getDiagramConfig(slug);
    if (existingData) {
      return { success: false, data: existingData, error: String(error) };
    }
    return { success: false, error: String(error) };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Always sync from database before returning
  const result = await syncDatabaseSchema(slug);

  if (result.data) {
    return NextResponse.json(result.data);
  }

  return NextResponse.json({ error: "Database not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Also sync from database on POST (dbdiagram.io uses POST to fetch data)
  const result = await syncDatabaseSchema(slug);

  if (result.data) {
    return NextResponse.json(result.data);
  }

  return NextResponse.json({ error: "Database not found" }, { status: 404 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();

    // Get existing data from database
    const existingData = await getDiagramConfig(slug);
    
    // Build update data
    const updateData = {
      content: body.content ?? existingData?.content ?? "",
      userid: body.userid ?? existingData?.userid ?? "openleviator",
      name: body.name ?? existingData?.name ?? "OpenLeviator Dashboard",
      diagram: existingData?.diagram ?? { tables: [] },
      tableGroups: body.tableGroups ?? (existingData?.tableGroups as unknown[]) ?? [],
      referencePaths: body.referencePaths ?? (existingData?.referencePaths as unknown[]) ?? [],
      detailLevel: body.detailLevel ?? existingData?.detailLevel ?? "All",
    };

    // Update diagram positions if provided
    if (body.diagram) {
      if (body.diagram.tables && Array.isArray(body.diagram.tables)) {
        console.log("[API] Received", body.diagram.tables.length, "tables");
        console.log("[API] First table:", body.diagram.tables[0]);
        updateData.diagram = {
          ...updateData.diagram,
          ...body.diagram,
          tables: body.diagram.tables,
        };
      } else {
        updateData.diagram = {
          ...updateData.diagram,
          ...body.diagram,
        };
      }
    }

    // Save to database
    const saved = await saveDiagramConfig(slug, updateData);
    
    if (saved) {
      const result = {
        _id: slug,
        ...updateData,
        createdAt: existingData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  } catch (error) {
    console.error("[API] Error updating database:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return PUT(request, context);
}
