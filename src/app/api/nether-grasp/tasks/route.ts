/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

// Force dynamic rendering for all requests to this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

interface Task {
  id?: number;
  ComponentName: string;
  component_directory: string;
  PageName: string;
  date_created: string;
  status:
    | "Queued"
    | "Pending"
    | "Running"
    | "Deploying"
    | "Completed"
    | "Error";
  date_completed: string | null;
  agent_id: string | null;
  agent_status:
    | "CREATING"
    | "RUNNING"
    | "FINISHED"
    | "ERROR"
    | "EXPIRED"
    | null;
  agent_url: string | null;
  branch_name: string | null;
  task_type?: "component" | "auto-fix" | "deployment-error";
  deployment_id?: string | null;
  deployment_logs?: string | null;
  deployment_url?: string | null;
  error_info?: {
    logs: string;
    analysis: {
      isAutoFixable: boolean;
      errorType: string;
      componentPath: string | null;
      lineNumber: number | null;
      errorMessage: string;
      severity: "error" | "warning";
    };
    deploymentUrl: string;
    timestamp: string;
    original_task?: string;
    original_agent_id?: string | null;
  };
}

// GET - Retrieve all tasks
export async function GET() {
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.error("❌ DATABASE_URL environment variable is not set!");
      return NextResponse.json(
        {
          error: "Database configuration missing",
          details: "DATABASE_URL environment variable is not set in Vercel",
          setup_guide: "https://vercel.com/docs/projects/environment-variables",
        },
        { status: 500 },
      );
    }

    const dbTasks = await db.task.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map Prisma tasks to legacy Task format for backward compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks: Task[] = dbTasks.map((task: any) => ({
      id: task.id,
      ComponentName: task.componentName,
      component_directory: task.componentDirectory,
      PageName: task.pageName,
      date_created: task.createdAt.toISOString(),
      status: task.status as Task["status"],
      date_completed: task.completedAt?.toISOString() ?? null,
      agent_id: task.agentId,
      agent_status: task.agentStatus as Task["agent_status"],
      agent_url: task.agentUrl,
      branch_name: task.branchName,
      task_type: task.taskType as Task["task_type"],
      deployment_id: task.deploymentId,
      deployment_logs: task.errorLogs ?? null,
      deployment_url: task.errorDeploymentUrl ?? null,
      error_info: task.errorLogs
        ? {
            logs: task.errorLogs,
            analysis: {
              isAutoFixable: task.errorIsAutoFixable ?? false,
              errorType: task.errorType ?? "unknown",
              componentPath: task.errorComponentPath,
              lineNumber: task.errorLineNumber ?? null,
              errorMessage: task.errorMessage ?? "",
              severity: (task.errorSeverity as "error" | "warning") ?? "error",
            },
            deploymentUrl: task.errorDeploymentUrl ?? "",
            timestamp: task.createdAt.toISOString(),
            original_task: task.errorOriginalTask ?? undefined,
            original_agent_id: task.errorOriginalAgentId ?? undefined,
          }
        : undefined,
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error reading tasks:", error);

    // Handle Prisma connection errors specifically
    if (
      error instanceof Error &&
      error.message.includes("Can't reach database")
    ) {
      return NextResponse.json(
        {
          error: "Database connection failed",
          details:
            "Cannot connect to Supabase database. Please check DATABASE_URL in Vercel environment variables.",
          prisma_error: error.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to read tasks" },
      { status: 500 },
    );
  }
}

// POST - Add a new task
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ComponentName?: string;
      component_directory?: string;
      PageName?: string;
      status?: Task["status"];
      agent_id?: string;
      agent_status?: Task["agent_status"];
      agent_url?: string;
      branch_name?: string;
      task_type?: Task["task_type"];
      error_info?: Task["error_info"];
    };

    const {
      ComponentName,
      component_directory,
      PageName,
      status,
      agent_id,
      agent_status,
      agent_url,
      branch_name,
      task_type,
      error_info,
    } = body;

    if (!ComponentName || !component_directory || !PageName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const dbTask = await db.task.create({
      data: {
        componentName: ComponentName,
        componentDirectory: component_directory,
        pageName: PageName,
        status: status ?? (agent_id ? "Running" : "Pending"),
        agentId: agent_id ?? null,
        agentStatus: agent_status ?? null,
        agentUrl: agent_url ?? null,
        branchName: branch_name ?? null,
        taskType: task_type ?? "component",
        // Error info fields
        errorLogs: error_info?.logs ?? null,
        errorType: error_info?.analysis?.errorType ?? null,
        errorMessage: error_info?.analysis?.errorMessage ?? null,
        errorComponentPath: error_info?.analysis?.componentPath ?? null,
        errorLineNumber: error_info?.analysis?.lineNumber ?? null,
        errorIsAutoFixable: error_info?.analysis?.isAutoFixable ?? null,
        errorSeverity: error_info?.analysis?.severity ?? null,
        errorDeploymentUrl: error_info?.deploymentUrl ?? null,
        errorOriginalTask: error_info?.original_task ?? null,
        errorOriginalAgentId: error_info?.original_agent_id ?? null,
      },
    });

    // Map back to legacy format
    const newTask: Task = {
      ComponentName: dbTask.componentName,
      component_directory: dbTask.componentDirectory,
      PageName: dbTask.pageName,
      date_created: dbTask.createdAt.toISOString(),
      status: dbTask.status as Task["status"],
      date_completed: null,
      agent_id: dbTask.agentId,
      agent_status: dbTask.agentStatus as Task["agent_status"],
      agent_url: dbTask.agentUrl,
      branch_name: dbTask.branchName,
      task_type: dbTask.taskType as Task["task_type"],
      error_info,
    };

    return NextResponse.json({ success: true, task: newTask });
  } catch (error) {
    console.error("Error adding task:", error);
    return NextResponse.json({ error: "Failed to add task" }, { status: 500 });
  }
}

// PATCH - Update task status
export async function PATCH(request: NextRequest) {
  console.log(
    "\n🔧 ========== PATCH /api/nether-grasp/tasks called ==========",
  );
  console.log("📍 Request URL:", request.url);
  console.log("📍 Request method:", request.method);

  try {
    const body = (await request.json()) as {
      id?: number;
      agent_id?: string;
      ComponentName?: string;
      status?: Task["status"];
      agent_status?: Task["agent_status"];
      agent_url?: string;
      branch_name?: string;
      deployment_logs?: string;
      deployment_url?: string;
      retry_count?: number;
      previous_agent_id?: string;
    };

    console.log("📦 Request body received:", JSON.stringify(body, null, 2));

    const {
      id,
      agent_id,
      ComponentName,
      status,
      agent_status,
      agent_url,
      branch_name,
      deployment_logs,
      deployment_url,
      retry_count,
      previous_agent_id,
    } = body;

    console.log(
      "🔍 Identifiers - id:",
      id,
      "agent_id:",
      agent_id,
      "ComponentName:",
      ComponentName,
    );

    // Allow finding by ID for retry updates
    if (!id && !agent_id && !ComponentName) {
      console.error("❌ Missing required identifier");
      return NextResponse.json(
        {
          error: "Missing required identifier (id, agent_id, or ComponentName)",
        },
        { status: 400 },
      );
    }

    // Find the task
    // Priority: id > ComponentName > agent_id > branch_name
    // We search by ComponentName first when available because tasks are created with ComponentName,
    // and agent_id is assigned later during the update
    console.log(
      "🔍 Searching for task with:",
      id
        ? `id=${id}`
        : ComponentName
          ? `ComponentName=${ComponentName}`
          : agent_id
            ? `agent_id=${agent_id}`
            : `branch_name=${branch_name}`,
    );

    let existingTask = await db.task.findFirst({
      where: id
        ? { id }
        : ComponentName
          ? { componentName: ComponentName }
          : { agentId: agent_id },
    });

    // Fallback: If not found by agent_id and branch_name is provided, try searching by branch
    if (!existingTask && agent_id && branch_name) {
      console.log(
        "🔄 Agent ID not found, trying fallback search by branch_name:",
        branch_name,
      );
      existingTask = await db.task.findFirst({
        where: { branchName: branch_name },
        orderBy: { createdAt: "desc" },
      });
      if (existingTask) {
        console.log(
          "✅ Found task by branch_name fallback:",
          existingTask.id,
          "-",
          existingTask.componentName,
        );
      }
    }

    console.log(
      "📋 Found task:",
      existingTask
        ? `ID ${existingTask.id} - ${existingTask.componentName}`
        : "NOT FOUND",
    );

    if (!existingTask) {
      console.error("❌ Task not found in database");
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Build update data object
    const updateData: any = {};

    if (status !== undefined) updateData.status = status;
    if (agent_status !== undefined) updateData.agentStatus = agent_status;
    if (agent_id !== undefined) updateData.agentId = agent_id;
    if (agent_url !== undefined) updateData.agentUrl = agent_url;
    if (branch_name !== undefined) updateData.branchName = branch_name;
    if (deployment_logs !== undefined) updateData.errorLogs = deployment_logs;
    if (deployment_url !== undefined)
      updateData.errorDeploymentUrl = deployment_url;

    // Update completedAt timestamp
    if (status === "Completed") {
      updateData.completedAt = new Date();
    }

    console.log("📝 Update data:", JSON.stringify(updateData, null, 2));

    // Update the task
    const updatedTask = await db.task.update({
      where: { id: existingTask.id },
      data: updateData,
    });

    console.log("✅ Task updated successfully:", updatedTask.id);

    // Map back to legacy format
    const task: Task = {
      ComponentName: updatedTask.componentName,
      component_directory: updatedTask.componentDirectory,
      PageName: updatedTask.pageName,
      date_created: updatedTask.createdAt.toISOString(),
      status: updatedTask.status as Task["status"],
      date_completed: updatedTask.completedAt?.toISOString() ?? null,
      agent_id: updatedTask.agentId,
      agent_status: updatedTask.agentStatus as Task["agent_status"],
      agent_url: updatedTask.agentUrl,
      branch_name: updatedTask.branchName,
      task_type: updatedTask.taskType as Task["task_type"],
    };

    console.log("🎉 Returning success response");
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("❌❌❌ PATCH ERROR:", error);
    console.error("❌ Error type:", typeof error);
    console.error(
      "❌ Error instance:",
      error instanceof Error ? "Error" : "Unknown",
    );
    if (error instanceof Error) {
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);
    }

    // Handle Prisma connection errors specifically
    if (
      error instanceof Error &&
      error.message.includes("Can't reach database")
    ) {
      return NextResponse.json(
        {
          error: "Database connection failed",
          details:
            "Cannot connect to Supabase database. Please check DATABASE_URL in Vercel environment variables.",
          prisma_error: error.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update task",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// DELETE - Delete a task
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      agent_id?: string;
      ComponentName?: string;
    };

    const { agent_id, ComponentName } = body;

    if (!agent_id && !ComponentName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Find the task
    const existingTask = await db.task.findFirst({
      where: agent_id
        ? { agentId: agent_id }
        : { componentName: ComponentName },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Delete the task
    await db.task.delete({
      where: { id: existingTask.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
