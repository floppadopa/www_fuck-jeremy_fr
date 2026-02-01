/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-regexp-exec */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Disable caching for this route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Deployment Webhook Handler
 * Receives deployment events from Vercel and triggers auto-fix agents for errors
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("VERCEL_WEBHOOK_SECRET is not set");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // Verify webhook signature from Vercel
    const signature = request.headers.get("x-vercel-signature");

    if (!signature) {
      console.warn("⚠️ No signature provided in Vercel webhook");
      return NextResponse.json(
        { error: "No signature provided" },
        { status: 401 }
      );
    }

    // Get the raw body for signature verification
    const body = await request.text();
    const webhookData = JSON.parse(body);

    // Verify signature (Vercel uses SHA-1)
    const expectedSignature = crypto
      .createHmac("sha1", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.warn("⚠️ Invalid Vercel webhook signature");
      console.warn(`Expected: ${expectedSignature}`);
      console.warn(`Received: ${signature}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    console.log("\n📨 Received Vercel webhook:", webhookData.type);
    console.log(
      "📦 Full webhook payload:",
      JSON.stringify(webhookData, null, 2)
    );

    // Handle deployment events
    switch (webhookData.type) {
      case "deployment.error":
      case "deployment.failed":
        await handleDeploymentError(webhookData);
        break;

      case "deployment.succeeded":
        console.log("✅ Deployment succeeded:", webhookData.deployment?.url);
        // This event fires for BOTH preview and production
        // We'll check inside the handler which one it is
        await handleDeploymentSuccess(webhookData);
        break;

      default:
        console.log("ℹ️ Unhandled webhook type:", webhookData.type);
    }

    return NextResponse.json({ received: true, type: webhookData.type });
  } catch (error) {
    console.error("❌ Error processing Vercel webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Handle successful deployment
 * This fires for BOTH preview and production deployments
 */
async function handleDeploymentSuccess(webhookData: VercelWebhookData) {
  try {
    const deployment = webhookData.payload?.deployment;
    const target = webhookData.payload?.target;

    // Determine if this is a preview or production deployment
    // Preview: target !== "production" OR URL contains "git-"
    const isPreview =
      target !== "production" || deployment?.url?.includes("-git-");

    if (isPreview) {
      // PREVIEW DEPLOYMENT SUCCEEDED - Trigger auto-merge
      console.log("✅ Preview deployment succeeded:", {
        deploymentId: deployment?.id,
        url: deployment?.url,
        target: target,
      });

      // Extract branch name from deployment metadata
      let branchName = null;

      if (webhookData.payload?.deployment?.meta?.githubCommitRef) {
        branchName = webhookData.payload.deployment.meta.githubCommitRef;

        // Clean up branch name - Vercel might send "refs/heads/branch-name"
        if (branchName.startsWith("refs/heads/")) {
          branchName = branchName.replace("refs/heads/", "");
          console.log(`🔧 Cleaned branch name from refs/heads/ format`);
        }
      }

      if (!branchName) {
        console.warn(
          "⚠️ Could not determine branch name from preview deployment"
        );
        return;
      }

      console.log(
        `🎯 Preview deployment succeeded for branch: "${branchName}"`
      );

      // Find the task associated with this branch
      // Use production URL to avoid database connection issues from preview deployments
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "https://edu-luden-fr.vercel.app");

      console.log(`🔍 Fetching tasks from: ${baseUrl}/api/nether-grasp/tasks`);

      const tasksResponse = await fetch(`${baseUrl}/api/nether-grasp/tasks`);

      if (tasksResponse.ok) {
        const tasksData = (await tasksResponse.json()) as {
          tasks: Array<{
            ComponentName: string;
            status: string;
            date_created: string;
            agent_id: string | null;
            agent_status: string | null;
            branch_name: string | null;
          }>;
        };

        // Log all tasks for debugging
        console.log(
          `📊 Total tasks in database: ${tasksData.tasks?.length ?? 0}`
        );
        console.log(
          `🔍 Looking for task with branch_name="${branchName}", agent_status="FINISHED", status="Running" OR "Deploying"`
        );

        // Show tasks with matching branch (regardless of status)
        const tasksWithMatchingBranch = tasksData.tasks?.filter(
          (t) => t.branch_name === branchName
        );

        if (tasksWithMatchingBranch && tasksWithMatchingBranch.length > 0) {
          console.log(
            `📋 Found ${tasksWithMatchingBranch.length} task(s) with matching branch:`
          );
          tasksWithMatchingBranch.forEach((t) => {
            console.log(
              `   - ${t.ComponentName}: status="${t.status}", agent_status="${t.agent_status}", agent_id="${t.agent_id}"`
            );
          });
        } else {
          console.log(
            `⚠️ No tasks found with branch_name="${branchName}" at all!`
          );
          console.log(`📋 Available branch names in recent tasks:`);
          tasksData.tasks?.slice(0, 5).forEach((t) => {
            console.log(
              `   - "${t.branch_name}" (${t.ComponentName}, status=${t.status}, agent_status=${t.agent_status})`
            );
          });
        }

        // Find task with matching branch name
        let matchingTask = tasksData.tasks
          ?.filter(
            (t) =>
              t.branch_name === branchName &&
              t.agent_status === "FINISHED" &&
              (t.status === "Running" || t.status === "Deploying")
          )
          .sort((a, b) => {
            const dateA = new Date(a.date_created).getTime();
            const dateB = new Date(b.date_created).getTime();
            return dateB - dateA;
          })[0];

        // FALLBACK: If nether-grasp-staging deployed but no exact match,
        // find the most recent finished agent (agents work on Cursor branches, not nether-grasp-staging)
        if (!matchingTask && branchName === "nether-grasp-staging") {
          console.log(
            "🔄 Fallback: nether-grasp-staging deployed, looking for any recently finished agent..."
          );

          matchingTask = tasksData.tasks
            ?.filter(
              (t) =>
                t.agent_status === "FINISHED" &&
                (t.status === "Running" || t.status === "Deploying") &&
                t.agent_id !== null
            )
            .sort((a, b) => {
              const dateA = new Date(a.date_created).getTime();
              const dateB = new Date(b.date_created).getTime();
              return dateB - dateA;
            })[0];

          if (matchingTask) {
            console.log(
              `✅ Found finished agent (fallback): ${matchingTask.ComponentName} on branch "${matchingTask.branch_name}"`
            );
          }
        }

        if (matchingTask) {
          console.log(
            `✅ Found matching task: ${matchingTask.ComponentName} (agent: ${matchingTask.agent_id})`
          );
          console.log(
            `🚀 Preview succeeded! Marking task as ready for auto-merge...`
          );

          // Update task to "Deploying" (preview succeeded, ready for auto-merge)
          // The bridge server will poll this status and trigger the merge
          await fetch(`${baseUrl}/api/nether-grasp/tasks`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_id: matchingTask.agent_id,
              status: "Deploying",
              preview_deployment_url: deployment?.url,
            }),
          });

          console.log(
            "✅ Task updated to Deploying - bridge server will handle auto-merge"
          );
        } else {
          console.log(
            "ℹ️ No matching task found for this preview deployment (see details above)"
          );
        }
      }

      return; // Done with preview handling
    }

    // PRODUCTION DEPLOYMENT SUCCEEDED - Mark task as completed

    console.log("🎉 Production deployment succeeded:", {
      deploymentId: deployment?.id,
      url: deployment?.url,
    });

    // Find the most recent "Deploying" task and mark it as Completed
    // Use production URL to avoid database connection issues from preview deployments
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://edu-luden-fr.vercel.app");

    console.log(`🔍 Fetching tasks from: ${baseUrl}/api/nether-grasp/tasks`);

    const tasksResponse = await fetch(`${baseUrl}/api/nether-grasp/tasks`);

    console.log(`📊 Tasks API response status: ${tasksResponse.status}`);

    if (tasksResponse.ok) {
      const tasksData = (await tasksResponse.json()) as {
        tasks: Array<{
          ComponentName: string;
          status: string;
          date_created: string;
          agent_id: string | null;
          agent_status: string | null;
        }>;
      };

      console.log(`📋 Total tasks found: ${tasksData.tasks?.length ?? 0}`);
      console.log(
        `🔍 Looking for tasks with status="Deploying" and agent_status="FINISHED"`
      );

      // Find most recently deployed task (status = "Deploying")
      const deployingTask = tasksData.tasks
        ?.filter(
          (t) => t.status === "Deploying" && t.agent_status === "FINISHED"
        )
        .sort((a, b) => {
          const dateA = new Date(a.date_created).getTime();
          const dateB = new Date(b.date_created).getTime();
          return dateB - dateA;
        })[0];

      if (deployingTask) {
        console.log(
          `✅ Found deploying task: ${deployingTask.ComponentName} (agent: ${deployingTask.agent_id})`
        );
        console.log(
          `🎉 Marking task as "Completed" - Production deployment succeeded!`
        );

        // Update the task status to "Completed"
        const updateResponse = await fetch(
          `${baseUrl}/api/nether-grasp/tasks`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_id: deployingTask.agent_id,
              ComponentName: deployingTask.ComponentName,
              status: "Completed",
              agent_status: "FINISHED",
            }),
          }
        );

        console.log(`📊 Update response status: ${updateResponse.status}`);

        if (updateResponse.ok) {
          console.log(
            `✅ Task "${deployingTask.ComponentName}" marked as Completed!`
          );
        } else {
          console.error(
            `❌ Failed to update task: ${
              updateResponse.status
            } - ${await updateResponse.text()}`
          );
        }
      } else {
        console.log("ℹ️ No deploying task found to mark as completed");
        // Log all task statuses for debugging
        if (tasksData.tasks && tasksData.tasks.length > 0) {
          console.log("📋 Current task statuses:");
          tasksData.tasks.slice(0, 5).forEach((t) => {
            console.log(
              `  - ${t.ComponentName}: status="${t.status}", agent_status="${t.agent_status}"`
            );
          });
        }
      }
    } else {
      console.error(
        `❌ Failed to fetch tasks: ${
          tasksResponse.status
        } - ${await tasksResponse.text()}`
      );
    }
  } catch (error) {
    console.error("❌ Error handling deployment success:", error);
  }
}

/**
 * Handle deployment errors by notifying the bridge server
 */
async function handleDeploymentError(webhookData: VercelWebhookData) {
  try {
    const deployment = webhookData.payload?.deployment;
    const project = webhookData.payload?.project;
    const target = webhookData.payload?.target;

    // Check if this is a preview deployment
    const isPreview =
      target !== "production" || deployment?.url?.includes("git-");

    console.log("❌ Deployment failed:", {
      deploymentId: deployment?.id,
      url: deployment?.url,
      project: project?.name,
      isPreview: isPreview,
    });

    // If preview deployment failed, mark task as Error and DON'T merge
    if (isPreview) {
      console.log("❌ Preview deployment failed - will NOT merge to main");

      // Extract branch name
      let branchName = null;
      if (webhookData.payload?.deployment?.meta?.githubCommitRef) {
        branchName = webhookData.payload.deployment.meta.githubCommitRef;

        // Clean up branch name - Vercel might send "refs/heads/branch-name"
        if (branchName.startsWith("refs/heads/")) {
          branchName = branchName.replace("refs/heads/", "");
          console.log(`🔧 Cleaned branch name from refs/heads/ format`);
        }
      }

      if (branchName) {
        // Find and mark task as Error
        // Use production URL since this deployment failed and its API won't work
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : "https://edu-luden-fr.vercel.app");

        const tasksResponse = await fetch(`${baseUrl}/api/nether-grasp/tasks`);

        if (tasksResponse.ok) {
          const tasksData = (await tasksResponse.json()) as {
            tasks: Array<{
              ComponentName: string;
              status: string;
              date_created: string;
              agent_id: string | null;
              agent_status: string | null;
              branch_name: string | null;
            }>;
          };

          console.log(`🔍 Looking for task with branch: "${branchName}"`);
          console.log(
            `📋 Available tasks:`,
            tasksData.tasks?.slice(0, 5).map((t) => ({
              ComponentName: t.ComponentName,
              branch: t.branch_name,
              status: t.status,
              agent_id: t.agent_id,
              agent_status: t.agent_status,
            }))
          );

          const matchingTask = tasksData.tasks
            ?.filter(
              (t) =>
                t.branch_name === branchName &&
                (t.status === "Running" || t.status === "Deploying") &&
                (t.agent_status === "CREATING" ||
                  t.agent_status === "RUNNING" ||
                  t.agent_status === "FINISHED")
            )
            .sort(
              (a, b) =>
                new Date(b.date_created).getTime() -
                new Date(a.date_created).getTime()
            )[0];

          if (matchingTask) {
            console.log(
              `❌ Marking task "${matchingTask.ComponentName}" as Error due to preview deployment failure`
            );
            console.log(
              `🔍 Task details - agent_id: ${matchingTask.agent_id}, status: ${matchingTask.status}, agent_status: ${matchingTask.agent_status}`
            );

            // Try to get deployment logs for retry mechanism
            let deploymentLogs = "No detailed logs available";

            try {
              // Fetch deployment logs from Vercel API if available
              const logsFromWebhook = webhookData.payload?.logs?.join("\n");
              if (logsFromWebhook) {
                console.log("✅ Using logs from webhook payload");
                deploymentLogs = logsFromWebhook;
              } else if (deployment?.id) {
                console.log(
                  `🔍 Attempting to fetch build logs for deployment: ${deployment.id}`
                );
                // Fetch detailed build logs from Vercel API
                const buildLogs = await fetchVercelBuildLogs(deployment.id);
                if (buildLogs) {
                  console.log(
                    `✅ Successfully fetched ${buildLogs.length} characters of build logs`
                  );
                  deploymentLogs = buildLogs;
                } else {
                  console.warn(
                    "⚠️ Failed to fetch build logs - VERCEL_API_TOKEN may not be configured"
                  );
                  console.warn(
                    "💡 Add VERCEL_API_TOKEN to Vercel environment variables for detailed error logs"
                  );
                  // Fallback to generic message
                  deploymentLogs = `Deployment ${
                    deployment.id
                  } failed. Check Vercel dashboard for details: ${
                    deployment?.url || "N/A"
                  }`;
                }
              }
            } catch (logError) {
              console.error("❌ Error fetching deployment logs:", logError);
            }

            const updateResponse = await fetch(
              `${baseUrl}/api/nether-grasp/tasks`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  agent_id: matchingTask.agent_id,
                  status: "Error",
                  agent_status: "ERROR",
                  deployment_logs: deploymentLogs,
                  deployment_url: deployment?.url ?? null,
                }),
              }
            );

            if (updateResponse.ok) {
              console.log(`✅ Successfully marked task as Error`);
            } else {
              console.log(`⚠️ Failed to update task: ${updateResponse.status}`);
            }
          } else {
            console.log(
              `⚠️ No matching task found for branch: "${branchName}"`
            );
            console.log(`🔍 Reason: Looking for tasks with:`);
            console.log(`   - branch_name === "${branchName}"`);
            console.log(`   - status === "Running" OR "Deploying"`);
            console.log(
              `   - agent_status === "CREATING", "RUNNING", or "FINISHED"`
            );
            console.log(
              `📋 Tasks with matching branch_name (any status):`,
              tasksData.tasks
                ?.filter((t) => t.branch_name === branchName)
                .map((t) => ({
                  ComponentName: t.ComponentName,
                  status: t.status,
                  agent_status: t.agent_status,
                  agent_id: t.agent_id,
                }))
            );
          }
        }
      }

      return; // Don't continue with production error handling
    }

    // Extract error information (for production deployments)
    const errorLogs = webhookData.payload?.logs?.join("\n") ?? "";
    const deploymentUrl = deployment?.url ?? "";
    const deploymentId = deployment?.id ?? "";

    // Parse error to determine if it's auto-fixable
    const errorAnalysis = analyzeError(errorLogs);

    console.log("🔍 Error analysis:", errorAnalysis);

    // Note: Bridge server will detect the error by polling task status
    // No need to actively notify it since Vercel can't reach local machine

    // Also save to tasks list for manual fixing option
    await saveErrorToTaskList(errorAnalysis, errorLogs, deploymentUrl);
  } catch (error) {
    console.error("❌ Error handling deployment error:", error);
  }
}

/**
 * Analyze error logs to determine if auto-fixable
 */
function analyzeError(errorLogs: string): ErrorAnalysis {
  const analysis: ErrorAnalysis = {
    isAutoFixable: false,
    errorType: "unknown",
    componentPath: null,
    lineNumber: null,
    errorMessage: "",
    severity: "error",
  };

  // Extract component path
  const componentMatch = errorLogs.match(/\.\/([^\s:]+\.tsx?)/);
  if (componentMatch && componentMatch[1]) {
    analysis.componentPath = componentMatch[1];
  }

  // Extract line number
  const lineMatch = errorLogs.match(/:(\d+):\d+/);
  if (lineMatch && lineMatch[1]) {
    analysis.lineNumber = parseInt(lineMatch[1]);
  }

  // Determine error type and if auto-fixable
  if (errorLogs.includes("is possibly 'undefined'")) {
    analysis.errorType = "typescript-undefined";
    analysis.isAutoFixable = true;
    analysis.errorMessage = "Variable possibly undefined - needs null check";
  } else if (errorLogs.includes("is possibly 'null'")) {
    analysis.errorType = "typescript-null";
    analysis.isAutoFixable = true;
    analysis.errorMessage = "Variable possibly null - needs null check";
  } else if (
    errorLogs.includes("Type") &&
    errorLogs.includes("is not assignable to type")
  ) {
    analysis.errorType = "typescript-type-mismatch";
    analysis.isAutoFixable = true;
    analysis.errorMessage = "Type mismatch - needs type correction";
  } else if (errorLogs.includes("Cannot find module")) {
    analysis.errorType = "missing-import";
    analysis.isAutoFixable = false; // Might need package install
    analysis.errorMessage = "Missing module or import";
  } else if (errorLogs.includes("SyntaxError")) {
    analysis.errorType = "syntax-error";
    analysis.isAutoFixable = true;
    analysis.errorMessage = "Syntax error in code";
  } else {
    analysis.errorType = "unknown";
    analysis.isAutoFixable = false;
    analysis.errorMessage = errorLogs.split("\n")[0] ?? "Unknown error";
  }

  return analysis;
}

/**
 * Save error to tasks list and update original task
 */
async function saveErrorToTaskList(
  analysis: ErrorAnalysis,
  errorLogs: string,
  deploymentUrl: string
) {
  try {
    // Use production URL since this might be called from a failed deployment
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://edu-luden-fr.vercel.app");

    // First, find the most recent completed task (likely the one that caused this deployment)
    const tasksResponse = await fetch(`${baseUrl}/api/nether-grasp/tasks`);

    if (tasksResponse.ok) {
      const tasksData = (await tasksResponse.json()) as {
        tasks: Array<{
          ComponentName: string;
          status: string;
          date_created: string;
          date_completed: string | null;
          agent_id: string | null;
        }>;
      };

      // Find most recently completed task
      // Find most recent "Deploying" task (deployment in progress)
      const recentTask = tasksData.tasks
        ?.filter((t) => t.status === "Deploying" || t.status === "Completed")
        .sort((a, b) => {
          const dateA = new Date(a.date_created).getTime();
          const dateB = new Date(b.date_created).getTime();
          return dateB - dateA;
        })[0];

      if (recentTask) {
        console.log(
          `🔍 Found recent task: ${recentTask.ComponentName} (agent: ${recentTask.agent_id})`
        );
        console.log(
          `🔄 Updating task status to "Error" due to deployment failure`
        );

        // Update the task status back to "Error" (deployment failed)
        await fetch(`${baseUrl}/api/nether-grasp/tasks`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: recentTask.agent_id,
            ComponentName: recentTask.ComponentName,
            status: "Error", // Mark as Error due to deployment failure
            agent_status: "ERROR",
          }),
        });

        console.log(
          `✅ Updated task "${recentTask.ComponentName}" to Error status`
        );

        // Store error info for this task
        await fetch(`${baseUrl}/api/nether-grasp/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ComponentName: `${recentTask.ComponentName} (Fix)`,
            component_directory: analysis.componentPath
              ? `/${analysis.componentPath.split("/").slice(0, -1).join("/")}`
              : "/",
            PageName: "Deployment Error Fix",
            agent_id: null,
            agent_status: null,
            agent_url: null,
            branch_name: "main",
            task_type: "deployment-error",
            error_info: {
              logs: errorLogs,
              analysis: analysis,
              deploymentUrl: deploymentUrl,
              timestamp: new Date().toISOString(),
              original_task: recentTask.ComponentName,
              original_agent_id: recentTask.agent_id,
            },
          }),
        });

        console.log("✅ Created fix task for deployment error");
        return;
      }
    }

    // Fallback: If no recent task found, create standalone error task
    await fetch(`${baseUrl}/api/nether-grasp/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ComponentName: analysis.componentPath ?? "Unknown",
        component_directory: analysis.componentPath
          ? `/${analysis.componentPath.split("/").slice(0, -1).join("/")}`
          : "/",
        PageName: "Deployment Error Fix",
        agent_id: null,
        agent_status: null,
        agent_url: null,
        branch_name: "main",
        task_type: "deployment-error",
        error_info: {
          logs: errorLogs,
          analysis: analysis,
          deploymentUrl: deploymentUrl,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    console.log("✅ Saved deployment error to task list");
  } catch (error) {
    console.error("❌ Failed to save error to task list:", error);
  }
}

/**
 * Fetch detailed build logs from Vercel API
 */
async function fetchVercelBuildLogs(
  deploymentId: string
): Promise<string | null> {
  try {
    const vercelToken = process.env.VERCEL_API_TOKEN;

    if (!vercelToken) {
      console.warn(
        "⚠️ VERCEL_API_TOKEN not set - cannot fetch detailed build logs"
      );
      console.warn(
        "💡 Set VERCEL_API_TOKEN in .env to enable detailed error logs"
      );
      return null;
    }

    console.log(`📥 Fetching build logs for deployment: ${deploymentId}`);

    const url = `https://api.vercel.com/v3/deployments/${deploymentId}/events`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${vercelToken}`,
      },
    });

    if (!response.ok) {
      console.warn(
        `⚠️ Failed to fetch build logs: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const events = (await response.json()) as unknown;

    // Debug: Log the structure of the response
    console.log(
      `🔍 Response type: ${Array.isArray(events) ? "Array" : typeof events}`
    );
    if (Array.isArray(events)) {
      console.log(`📊 Total events: ${events.length}`);
      console.log(
        `📋 Sample event structure:`,
        events[0] ? JSON.stringify(events[0]).substring(0, 200) : "No events"
      );
    }

    // Parse events to extract build logs
    // Vercel API returns an array with different possible structures
    if (Array.isArray(events)) {
      const logLines = events
        .filter(
          (event: {
            type?: string;
            text?: string;
            payload?: { text?: string; timestamp?: number };
          }) => {
            // Vercel events can have type "stdout" or "stderr"
            return event.type === "stdout" || event.type === "stderr";
          }
        )
        .map(
          (event: {
            type?: string;
            text?: string;
            payload?: { text?: string; timestamp?: number };
          }) => {
            // Try both event.text (direct) and event.payload.text (nested)
            const text = event.text || event.payload?.text || "";
            const timestamp = event.payload?.timestamp
              ? new Date(event.payload.timestamp).toLocaleTimeString()
              : "";
            return timestamp ? `${timestamp} ${text}` : text;
          }
        )
        .filter((line) => line.trim().length > 0) // Remove empty lines
        .join("\n");

      if (logLines && logLines.trim().length > 0) {
        console.log(
          `✅ Successfully fetched ${logLines.length} characters of build logs`
        );
        return logLines;
      } else {
        console.warn("⚠️ Events found but all log lines were empty");
        console.log(
          `🔍 Sample events:`,
          events.slice(0, 3).map((e: { type?: string; text?: string }) => ({
            type: e.type,
            text: e.text?.substring(0, 50),
          }))
        );
      }
    }

    console.warn("⚠️ No build logs found in API response");
    return null;
  } catch (error) {
    console.error("❌ Error fetching build logs from Vercel API:", error);
    return null;
  }
}

// TypeScript interfaces
interface VercelWebhookData {
  type: string;
  payload?: {
    target?: string;
    deployment?: {
      id: string;
      url: string;
      state?: string;
      meta?: {
        githubCommitRef?: string;
        githubCommitSha?: string;
        githubCommitMessage?: string;
      };
    };
    project?: {
      id?: string;
      name?: string;
    };
    logs?: string[];
  };
}

interface ErrorAnalysis {
  isAutoFixable: boolean;
  errorType: string;
  componentPath: string | null;
  lineNumber: number | null;
  errorMessage: string;
  severity: "error" | "warning";
}
