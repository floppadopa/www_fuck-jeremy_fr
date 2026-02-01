#!/usr/bin/env node
/**
 * Nether Bridge Server
 *
 * Local WebSocket server that acts as a bridge between the nether-grasp web UI
 * and the Cursor IDE. This allows automated prompts to be sent from the browser
 * to Cursor for AI-assisted code modifications.
 *
 * Usage: node nether-bridge-server.js
 */

import { WebSocketServer, WebSocket } from "ws";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import https from "https";
import { URL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3939;
const CURSOR_EXTENSION_PORT = 3940;
const PROMPTS_DIR = join(__dirname, "nether-grasp", "prompts");
const ACTIVE_PROMPT_FILE = join(PROMPTS_DIR, "active-prompt.txt");
const PROMPT_HISTORY_FILE = join(PROMPTS_DIR, "prompt-history.json");

// Cursor API Configuration
// Generated after GitHub App installation at https://cursor.com/settings
// This will be automatically configured by the installer, or you can set CURSOR_API_KEY in .env
const CURSOR_API_KEY =
  process.env.CURSOR_API_KEY ||
  "key_24b93592fbe0f5cf83a2eb9e9563db0a47820050abb48336beadfd1c72ae1d72";
const CURSOR_API_BASE_URL = "https://api.cursor.com";

// Next.js App URL (for API calls) - will be auto-detected
let NEXT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || null;
const NEXT_APP_PORTS = [3000, 3001, 3002, 3003]; // Common Next.js ports

// WebSocket connection to Cursor extension
let cursorExtensionWs = null;
let cursorConnectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

// Retry tracking for failed deployments
const agentRetryMap = new Map(); // Maps agent_id -> { count: number, original_agent_id: string }
const MAX_RETRIES = 3;

// Task Queue System
const taskQueue = [];
let isProcessingTask = false;
let currentTaskId = null;

// Ensure prompts directory exists
if (!existsSync(PROMPTS_DIR)) {
  mkdirSync(PROMPTS_DIR, { recursive: true });
}

// Initialize prompt history
let promptHistory = [];
if (existsSync(PROMPT_HISTORY_FILE)) {
  try {
    promptHistory = JSON.parse(readFileSync(PROMPT_HISTORY_FILE, "utf-8"));
  } catch (err) {
    console.warn("Could not load prompt history, starting fresh");
  }
}

// HTTP server for handling webhook requests (auto-merge)
import http from "http";

const httpServer = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/auto-merge" && req.method === "POST") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        console.log("\n🚀 Auto-merge request received:", data);

        const { branch_name, agent_id, deployment_url } = data;

        if (!branch_name) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing branch_name" }));
          return;
        }

        console.log(`✅ Preview deployment succeeded for ${branch_name}`);
        console.log(`🔀 Initiating auto-merge to main...`);

        // Trigger the merge
        const pushResult = await pushToMainBranch(branch_name);

        if (pushResult.success) {
          console.log("✅ Successfully merged and pushed to main!");
          res.writeHead(200);
          res.end(
            JSON.stringify({
              success: true,
              message: "Auto-merge completed",
              details: pushResult.details,
            })
          );
        } else {
          console.log("❌ Auto-merge failed:", pushResult.error);
          res.writeHead(500);
          res.end(
            JSON.stringify({
              success: false,
              error: pushResult.error,
            })
          );
        }
      } catch (err) {
        console.error("❌ Error processing auto-merge request:", err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Attach WebSocket server to HTTP server
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   NETHER BRIDGE SERVER                    ║
╚═══════════════════════════════════════════════════════════╝

🚀 WebSocket server running on ws://localhost:${PORT}
🌐 HTTP server running on http://localhost:${PORT}
📁 Prompts directory: ${PROMPTS_DIR}
🎯 Ready to receive prompts from nether-grasp
🔌 Connecting to Cursor Extension on port ${CURSOR_EXTENSION_PORT}...

Waiting for connections...
`);
});

// Auto-discover Next.js port
async function discoverNextPort() {
  if (NEXT_APP_URL) {
    console.log(`🔧 Using configured URL: ${NEXT_APP_URL}`);
    return NEXT_APP_URL;
  }

  console.log("🔍 Auto-detecting Next.js server port...");

  for (const port of NEXT_APP_PORTS) {
    const testUrl = `http://localhost:${port}`;
    try {
      const response = await fetch(`${testUrl}/api/nether-grasp/tasks`, {
        method: "GET",
        signal: AbortSignal.timeout(1000), // 1 second timeout
      });

      if (response.ok || response.status === 404 || response.status === 500) {
        // If we get any response (even errors), the server is running
        console.log(`✅ Found Next.js server on port ${port}`);
        NEXT_APP_URL = testUrl;
        return testUrl;
      }
    } catch (err) {
      // Port not responding, try next one
      continue;
    }
  }

  // Fallback to default
  console.log(
    "⚠️ Could not detect Next.js server, using default: http://localhost:3000"
  );
  NEXT_APP_URL = "http://localhost:3000";
  return NEXT_APP_URL;
}

// Discover Next.js port on startup
discoverNextPort().then(() => {
  console.log(`🌐 Next.js API URL: ${NEXT_APP_URL}\n`);
});

// Smart fetch that auto-discovers port on 404 errors
async function fetchWithPortDiscovery(url, options = {}) {
  try {
    const response = await fetch(url, options);

    // If we get a 404 or connection error, try rediscovering the port
    if (response.status === 404) {
      console.log("⚠️ Got 404, rediscovering Next.js port...");
      await discoverNextPort();

      // Retry with new URL
      const newUrl = url.replace(/http:\/\/localhost:\d+/, NEXT_APP_URL);
      return await fetch(newUrl, options);
    }

    return response;
  } catch (err) {
    // Connection refused - server might have moved ports
    if (err.code === "ECONNREFUSED" || err.cause?.code === "ECONNREFUSED") {
      console.log("⚠️ Connection refused, rediscovering Next.js port...");
      await discoverNextPort();

      // Retry with new URL
      const newUrl = url.replace(/http:\/\/localhost:\d+/, NEXT_APP_URL);
      return await fetch(newUrl, options);
    }

    throw err;
  }
}

// Connect to Cursor extension
connectToCursorExtension();

wss.on("connection", (ws) => {
  console.log("✅ Client connected from nether-grasp");

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: "connection",
      status: "success",
      message: "Connected to Nether Bridge Server",
      timestamp: new Date().toISOString(),
    })
  );

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("\n📨 Received message:", message.type);

      switch (message.type) {
        case "ping":
          // Health check
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: new Date().toISOString(),
            })
          );
          break;

        case "send_prompt":
          handlePrompt(message, ws);
          break;

        case "get_history":
          ws.send(
            JSON.stringify({
              type: "history",
              data: promptHistory,
              timestamp: new Date().toISOString(),
            })
          );
          break;

        case "deployment_error":
          handleDeploymentError(message, ws);
          break;

        case "trigger_fix_agent":
          triggerFixAgent(message, ws);
          break;

        case "check_agent_status":
          checkAndSyncAgentStatus(message, ws);
          break;

        default:
          console.warn("⚠️  Unknown message type:", message.type);
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Unknown message type: ${message.type}`,
            })
          );
      }
    } catch (err) {
      console.error("❌ Error processing message:", err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to process message",
          error: err.message,
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("👋 Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
  });
});

function handlePrompt(message, ws) {
  const { prompt, metadata } = message;

  if (!prompt || !prompt.trim()) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Prompt cannot be empty",
      })
    );
    return;
  }

  const timestamp = new Date().toISOString();
  const promptEntry = {
    id: Date.now(),
    prompt: prompt.trim(),
    metadata: metadata || {},
    timestamp,
    status: "pending",
    ws: ws, // Store WebSocket connection
  };

  // Add to history
  promptHistory.unshift(promptEntry);
  if (promptHistory.length > 50) {
    promptHistory = promptHistory.slice(0, 50); // Keep last 50
  }
  writeFileSync(
    PROMPT_HISTORY_FILE,
    JSON.stringify(
      promptHistory.map((p) => ({ ...p, ws: undefined })),
      null,
      2
    ),
    "utf-8"
  );

  console.log(`✨ Prompt received (ID: ${promptEntry.id})`);
  console.log(`📋 Prompt preview: ${prompt.substring(0, 100)}...`);

  // Add to task queue
  addToQueue(promptEntry);
}

/**
 * Add task to queue and process if ready
 */
async function addToQueue(taskData) {
  const queuePosition = taskQueue.length + 1;

  taskQueue.push(taskData);

  console.log(
    `📋 Task added to queue (Position: ${queuePosition}, Total: ${taskQueue.length})`
  );
  console.log(`   Component: ${taskData.metadata?.componentName || "Unknown"}`);

  // Notify frontend that task is queued
  if (taskData.ws && taskData.ws.readyState === 1) {
    taskData.ws.send(
      JSON.stringify({
        type: "task_queued",
        task_id: taskData.id,
        queue_position: queuePosition,
        total_in_queue: taskQueue.length,
        metadata: taskData.metadata,
      })
    );
  }

  // Create database entry with Queued status
  try {
    const response = await fetchWithPortDiscovery(
      `${NEXT_APP_URL}/api/nether-grasp/tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ComponentName: taskData.metadata?.componentName,
          component_directory: taskData.metadata?.componentDirectory,
          PageName: taskData.metadata?.pageName,
          agent_id: null,
          agent_status: null,
          agent_url: null,
          branch_name: taskData.metadata?.stagingBranch,
          status: "Queued",
        }),
      }
    );

    if (response.ok) {
      console.log(`✅ Task added to database with Queued status`);
    }
  } catch (error) {
    console.error("❌ Failed to add queued task to database:", error.message);
  }

  // Start processing queue if not already processing
  processQueue();
}

/**
 * Process tasks from queue sequentially
 */
async function processQueue() {
  // If already processing or queue is empty, do nothing
  if (isProcessingTask || taskQueue.length === 0) {
    return;
  }

  // Get next task from queue
  const task = taskQueue.shift();
  isProcessingTask = true;
  currentTaskId = task.id;

  console.log(`\n🚀 Processing task from queue (ID: ${task.id})`);
  console.log(`   Remaining in queue: ${taskQueue.length}`);
  console.log(`   Component: ${task.metadata?.componentName || "Unknown"}`);

  try {
    // Step 1: Pull latest changes from main
    console.log("📥 Step 1: Pulling latest changes from main...");
    await new Promise((resolve, reject) => {
      exec(
        "git pull origin main",
        { cwd: __dirname, encoding: "utf-8", timeout: 30000 },
        (error, stdout, stderr) => {
          if (error && !stdout.includes("Already up to date")) {
            console.warn(`⚠️ Pull warning: ${stderr || error.message}`);
            // Continue anyway - not critical
          } else {
            console.log("✅ Local repository updated");
          }
          resolve();
        }
      );
    });

    // Step 2: Sync nether-grasp-staging branch and commit files
    console.log("🔄 Step 2: Syncing nether-grasp-staging branch...");
    const stagingBranch =
      task.metadata?.stagingBranch || "nether-grasp-staging";
    const taskComponentName = task.metadata?.componentName;

    await new Promise((resolve, reject) => {
      // Get current branch first
      exec(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: __dirname, encoding: "utf-8", timeout: 5000 },
        (error, stdout) => {
          const originalBranch = stdout?.trim() || "main";

          // Check if staging branch exists
          exec(
            "git branch --list",
            { cwd: __dirname, encoding: "utf-8", timeout: 5000 },
            (error2, branchList) => {
              const branchExists = branchList?.includes(stagingBranch);

              // Checkout or create staging branch
              const checkoutCmd = branchExists
                ? `git checkout ${stagingBranch}`
                : `git checkout -b ${stagingBranch}`;

              exec(
                checkoutCmd,
                { cwd: __dirname, encoding: "utf-8", timeout: 10000 },
                (error3, stdout3, stderr3) => {
                  if (error3) {
                    console.warn(
                      `⚠️ Could not checkout ${stagingBranch}: ${
                        stderr3 || error3.message
                      }`
                    );
                    resolve();
                    return;
                  }

                  if (branchExists) {
                    console.log(
                      `✅ Switched to staging branch: ${stagingBranch}`
                    );
                  } else {
                    console.log(
                      `✅ Created new staging branch: ${stagingBranch}`
                    );
                  }

                  // Sync with main branch
                  console.log("🔄 Merging latest from main into staging...");
                  exec(
                    "git fetch origin main && git merge origin/main --no-edit",
                    { cwd: __dirname, encoding: "utf-8", timeout: 30000 },
                    (error4, stdout4) => {
                      if (error4 && !stdout4?.includes("Already up to date")) {
                        console.warn(
                          "⚠️ Merge warning (continuing anyway):",
                          error4.message
                        );
                      } else {
                        console.log(`✅ ${stagingBranch} synced with main`);
                      }

                      // Add and commit the component files
                      if (taskComponentName) {
                        console.log(
                          `📦 Committing files for ${taskComponentName}...`
                        );
                        exec(
                          `git add -f "nether-grasp/${taskComponentName}" && git commit -m "feat: Add ${taskComponentName} component files for AI agent processing"`,
                          { cwd: __dirname, encoding: "utf-8", timeout: 10000 },
                          (error5, stdout5, stderr5) => {
                            if (
                              error5 &&
                              !stderr5?.includes("nothing to commit")
                            ) {
                              console.warn(
                                "⚠️ Commit warning:",
                                stderr5 || error5.message
                              );
                            } else if (stdout5?.includes("nothing to commit")) {
                              console.log("ℹ️  Files already committed");
                            } else {
                              console.log(
                                "✅ Files committed to staging branch"
                              );
                            }

                            // Push to remote
                            const pushCmd = branchExists
                              ? `git push origin ${stagingBranch}`
                              : `git push -u origin ${stagingBranch}`;

                            exec(
                              pushCmd,
                              {
                                cwd: __dirname,
                                encoding: "utf-8",
                                timeout: 30000,
                              },
                              (error6, stdout6, stderr6) => {
                                if (error6) {
                                  console.warn(
                                    "⚠️ Push warning:",
                                    stderr6 || error6.message
                                  );
                                } else {
                                  console.log(`✅ Pushed to ${stagingBranch}`);
                                }

                                // Switch back to original branch
                                exec(
                                  `git checkout ${originalBranch}`,
                                  {
                                    cwd: __dirname,
                                    encoding: "utf-8",
                                    timeout: 10000,
                                  },
                                  (error7) => {
                                    if (error7) {
                                      console.warn(
                                        "⚠️ Could not switch back to",
                                        originalBranch
                                      );
                                    } else {
                                      console.log(
                                        `✅ Switched back to ${originalBranch}`
                                      );
                                    }
                                    resolve();
                                  }
                                );
                              }
                            );
                          }
                        );
                      } else {
                        // No component name - just switch back
                        exec(
                          `git checkout ${originalBranch}`,
                          { cwd: __dirname, encoding: "utf-8", timeout: 10000 },
                          () => {
                            resolve();
                          }
                        );
                      }
                    }
                  );
                }
              );
            }
          );
        }
      );
    });

    console.log("✅ Repository ready for task processing");

    // Step 3: Update task status from Queued to Pending
    console.log("📝 Step 3: Updating task status to Pending...");
    console.log(`   ComponentName: ${taskComponentName}`);

    if (!taskComponentName) {
      console.warn("⚠️ ComponentName is missing, skipping status update");
    } else {
      try {
        const patchBody = {
          ComponentName: taskComponentName,
          status: "Pending",
        };
        console.log("📤 Sending PATCH request:", JSON.stringify(patchBody));

        const response = await fetchWithPortDiscovery(
          `${NEXT_APP_URL}/api/nether-grasp/tasks`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(patchBody),
          }
        );

        if (response.ok) {
          console.log("✅ Task status updated to Pending");
          const result = await response.json();
          console.log("✅ Update result:", result);
        } else {
          const errorText = await response.text();
          console.warn(`⚠️ Failed to update task status: ${response.status}`);
          console.warn(`⚠️ Response: ${errorText}`);
        }
      } catch (error) {
        console.warn("⚠️ Error updating task status:", error.message);
      }
    }

    // Step 4: Save to active prompt file
    const activePromptContent = `
╔═══════════════════════════════════════════════════════════╗
║              NEW PROMPT FROM NETHER-GRASP                 ║
╚═══════════════════════════════════════════════════════════╝

Timestamp: ${task.timestamp}
Prompt ID: ${task.id}

──────────────────────────────────────────────────────────────

${task.prompt}

──────────────────────────────────────────────────────────────

Metadata:
${JSON.stringify(task.metadata || {}, null, 2)}

──────────────────────────────────────────────────────────────

📝 INSTRUCTIONS FOR AI:
1. Read the prompt above carefully
2. Execute the requested changes to the webapp
3. Follow all project conventions (see conventions_rules.md)
4. After completing the task, delete this file
5. Mark the task as complete in your response

──────────────────────────────────────────────────────────────
`.trim();

    writeFileSync(ACTIVE_PROMPT_FILE, activePromptContent, "utf-8");

    console.log(`📄 Active prompt file: ${ACTIVE_PROMPT_FILE}`);

    // Automatically trigger Cursor to open new chat with prompt
    await triggerCursorChat(
      ACTIVE_PROMPT_FILE,
      task.prompt,
      task.ws,
      task.metadata
    );
  } catch (err) {
    console.error("❌ Error processing task:", err);

    if (task.ws && task.ws.readyState === 1) {
      task.ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to process task",
          error: err.message,
        })
      );
    }

    // Mark task as finished processing even if it failed
    isProcessingTask = false;
    currentTaskId = null;

    // Continue with next task
    processQueue();
  }
}

/**
 * Connect to Cursor Extension via WebSocket
 */
function connectToCursorExtension() {
  if (cursorConnectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    console.log(
      "⚠️  Could not connect to Cursor Extension after multiple attempts"
    );
    console.log(
      "   Please ensure the Nether Bridge extension is installed and running in Cursor"
    );
    console.log("   Install from: cursor-extension/ folder");
    return;
  }

  try {
    cursorExtensionWs = new WebSocket(
      `ws://localhost:${CURSOR_EXTENSION_PORT}`
    );

    cursorExtensionWs.on("open", () => {
      console.log("✅ Connected to Cursor Extension");
      cursorConnectionAttempts = 0; // Reset counter on successful connection
    });

    cursorExtensionWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("📨 Received from Cursor Extension:", message.type);

        if (message.type === "composer_opened") {
          console.log("✅ Cursor Composer opened successfully");
        }
      } catch (err) {
        console.error("❌ Error parsing message from Cursor Extension:", err);
      }
    });

    cursorExtensionWs.on("close", () => {
      console.log("👋 Disconnected from Cursor Extension");
      cursorExtensionWs = null;

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        cursorConnectionAttempts++;
        console.log(
          `🔄 Attempting to reconnect to Cursor Extension (${cursorConnectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`
        );
        connectToCursorExtension();
      }, 5000);
    });

    cursorExtensionWs.on("error", (err) => {
      console.log(
        "⚠️  Cursor Extension not available (make sure it's installed)"
      );
      cursorExtensionWs = null;
    });
  } catch (err) {
    console.error("❌ Failed to connect to Cursor Extension:", err.message);
    cursorExtensionWs = null;
  }
}

/**
 * Send prompt to Cursor using Background Agents API (Fully Autonomous)
 */
async function triggerCursorChat(promptFile, promptText, ws, metadata) {
  console.log("🤖 Triggering Cursor Background Agent (AUTONOMOUS MODE)...");

  try {
    // Method 1: Try Background Agents API (FULLY AUTONOMOUS)
    const stagingBranch = metadata?.stagingBranch || "nether-grasp-staging";
    const agentResponse = await createBackgroundAgent(
      promptText,
      stagingBranch
    );

    if (agentResponse.success) {
      console.log("✅ Background Agent created successfully!");
      console.log(`📋 Agent ID: ${agentResponse.agentId}`);
      console.log(`🔗 Agent URL: ${agentResponse.url || "N/A"}`);
      console.log("🤖 AI is now executing your prompt autonomously...");

      // Send agent info back to frontend
      if (ws && ws.readyState === 1) {
        // 1 = OPEN
        ws.send(
          JSON.stringify({
            type: "agent_created",
            agent_id: agentResponse.agentId,
            agent_status: agentResponse.response?.status || "CREATING",
            agent_url: agentResponse.url,
            branch_name: agentResponse.response?.target?.branchName || null,
            metadata: metadata,
          })
        );
      }

      // Start polling agent status
      pollAgentStatus(agentResponse.agentId, ws);

      return;
    }

    throw new Error("API call did not return success");
  } catch (apiError) {
    console.log("⚠️  Background Agents API failed, trying CLI method...");
    console.log(`   Error: ${apiError.message}`);

    // Fallback Method 2: Try Cursor CLI to open file
    const relativePath = promptFile
      .replace(__dirname + "\\", "")
      .replace(__dirname + "/", "");
    const cursorCliPath = join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "cursor",
      "resources",
      "app",
      "bin",
      "cursor.cmd"
    );
    const cursorCliCommand = `"${cursorCliPath}" "${ACTIVE_PROMPT_FILE}"`;

    console.log(`📤 Executing CLI: ${cursorCliCommand}`);

    exec(
      cursorCliCommand,
      {
        cwd: __dirname,
        timeout: 10000,
        encoding: "utf-8",
        shell: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.log("⚠️  CLI not available, trying extension method...");

          // Fallback Method 3: Extension
          const fullPrompt = `Read and execute the prompt in ${relativePath}`;
          if (
            cursorExtensionWs &&
            cursorExtensionWs.readyState === WebSocket.OPEN
          ) {
            const message = {
              type: "open_composer",
              prompt: fullPrompt,
              metadata: {
                source: "nether-bridge",
                timestamp: new Date().toISOString(),
                promptFile: promptFile,
                relativePath: relativePath,
              },
            };
            cursorExtensionWs.send(JSON.stringify(message));
            console.log("✅ Sent prompt to Cursor Extension (fallback method)");
          } else {
            console.log("⚠️  All methods failed");
            console.log(`   Prompt saved to: ${promptFile}`);
            console.log(
              `   Manual action: Press Ctrl+L and execute the prompt`
            );
          }
          return;
        }

        console.log("✅ Cursor CLI executed successfully");
        if (stdout) console.log("📄 Output:", stdout);
        if (stderr) console.log("⚠️  Stderr:", stderr);

        // Notify frontend that CLI method was used
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "agent_failed",
              message: "Background Agents API failed, CLI method used instead",
              file: promptFile,
              metadata: metadata,
            })
          );
        }
      }
    );
  }
}

/**
 * Push changes to main branch with safety checks
 * @param {string} agentBranch - The branch name the agent worked on (e.g., cursor/...)
 */
async function pushToMainBranch(agentBranch = null) {
  return new Promise((resolve) => {
    // Step 1: Check current branch
    exec(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: __dirname, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: "Failed to get current branch: " + error.message,
          });
          return;
        }

        const currentBranch = stdout.trim();
        console.log(`📍 Current branch: ${currentBranch}`);

        // Step 2: Check git status for uncommitted changes
        exec(
          "git status --porcelain",
          { cwd: __dirname, encoding: "utf-8" },
          (error, stdout) => {
            if (error) {
              resolve({
                success: false,
                error: "Failed to check git status: " + error.message,
              });
              return;
            }

            const hasChanges = stdout.trim().length > 0;
            console.log(
              `📋 Git status: ${
                hasChanges ? "Changes detected" : "Clean working directory"
              }`
            );

            // Step 3: Pull latest from main first
            console.log("📥 Pulling latest changes from main...");
            exec(
              "git pull origin main",
              { cwd: __dirname, encoding: "utf-8", timeout: 30000 },
              (error, stdout, stderr) => {
                if (error && !error.message.includes("Already up to date")) {
                  console.log(`⚠️ Pull warning: ${stderr || error.message}`);
                  // Continue anyway - agent might have created a new branch
                }

                // Step 4: Checkout main branch
                console.log("🔀 Switching to main branch...");
                exec(
                  "git checkout main",
                  { cwd: __dirname, encoding: "utf-8", timeout: 10000 },
                  (error, stdout, stderr) => {
                    if (error) {
                      resolve({
                        success: false,
                        error: `Failed to checkout main: ${
                          stderr || error.message
                        }`,
                      });
                      return;
                    }

                    console.log("✅ On main branch");

                    // Step 5: Merge the agent's branch
                    // Use the actual agent branch if provided, otherwise fallback to staging
                    const branchToMerge = agentBranch || "nether-grasp-staging";
                    console.log(
                      `🔀 Attempting to merge ${branchToMerge} into main...`
                    );

                    // First, try to fetch the agent's branch if it's a remote branch
                    if (agentBranch && agentBranch.startsWith("cursor/")) {
                      console.log(`📥 Fetching agent branch: ${agentBranch}`);
                      exec(
                        `git fetch origin ${agentBranch}`,
                        { cwd: __dirname, encoding: "utf-8", timeout: 20000 },
                        (fetchError) => {
                          if (fetchError) {
                            console.warn(
                              `⚠️ Could not fetch ${agentBranch}:`,
                              fetchError.message
                            );
                          }
                          // Continue with merge regardless
                          performMerge();
                        }
                      );
                    } else {
                      performMerge();
                    }

                    function performMerge() {
                      exec(
                        `git merge origin/${branchToMerge} --no-edit`,
                        { cwd: __dirname, encoding: "utf-8", timeout: 20000 },
                        (error, stdout, stderr) => {
                          // Check for merge conflicts
                          if (
                            error &&
                            (stderr.includes("CONFLICT") ||
                              error.message.includes("conflict"))
                          ) {
                            resolve({
                              success: false,
                              error:
                                "Merge conflict detected. Manual resolution required.",
                            });
                            return;
                          }

                          // If merge failed for another reason, log but continue (might already be merged)
                          if (error) {
                            console.log(
                              `⚠️ Merge note: ${stderr || error.message}`
                            );
                          }

                          // Step 6: Push to main
                          console.log("📤 Pushing to origin main...");
                          exec(
                            "git push origin main",
                            {
                              cwd: __dirname,
                              encoding: "utf-8",
                              timeout: 30000,
                            },
                            (error, stdout, stderr) => {
                              if (error) {
                                resolve({
                                  success: false,
                                  error: `Failed to push: ${
                                    stderr || error.message
                                  }`,
                                });
                                return;
                              }

                              console.log("✅ Push successful!");
                              console.log(stdout);

                              resolve({
                                success: true,
                                details: {
                                  branch: "main",
                                  message:
                                    "Changes automatically pushed to main",
                                  output: stdout.trim(),
                                },
                              });
                            }
                          );
                        }
                      );
                    } // End of performMerge function
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

/**
 * Strip ANSI color codes from text
 */
function stripAnsiCodes(text) {
  if (!text || typeof text !== "string") return text;
  // Remove ANSI escape codes (color codes, formatting, etc.)
  // Regex matches: \u001b[...m or \x1b[...m patterns
  return text.replace(/\u001b\[[0-9;]*m/g, "").replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Attempt to retry a failed deployment by creating a fix agent
 */
async function attemptDeploymentRetry(failedAgentId, task, ws) {
  try {
    console.log(`🔧 Creating fix agent for failed deployment...`);

    // Get deployment error logs from task
    const rawErrorLogs =
      task.deployment_logs || task.error_logs || "Unknown deployment error";
    const branchName = task.branch_name;

    // Strip ANSI color codes from logs for better readability in AI prompts
    const errorLogs = stripAnsiCodes(rawErrorLogs);

    // Create detailed fix prompt with error logs
    const fixPrompt = `🚨 DEPLOYMENT ERROR - FIX REQUIRED

A recent deployment to Vercel failed. Please analyze and fix the error.

**Deployment Error Logs:**
\`\`\`
${errorLogs}
\`\`\`

**Branch:** ${branchName || "unknown"}
**Failed Agent ID:** ${failedAgentId}

**Instructions:**
1. Carefully read the error logs above
2. Identify the root cause of the deployment failure
3. Locate the problematic file(s) and line(s)
4. Fix the error with the appropriate solution:
   - For TypeScript errors: Fix type definitions and type mismatches
   - For build errors: Fix syntax or compilation issues
   - For import errors: Correct import paths or missing dependencies
   - For runtime errors: Add proper error handling and null checks
5. Ensure the fix doesn't break existing functionality
6. Test that the code compiles without errors
7. Follow all project conventions (see conventions_rules.md)
8. Commit with message: "fix: Resolve deployment error (retry)"

**IMPORTANT:**
- Only fix the specific deployment error
- Do NOT make unrelated changes
- Ensure all TypeScript strict mode requirements are met
`;

    console.log(`📝 Fix prompt created (${fixPrompt.length} chars)`);

    // Create a new background agent with the fix prompt
    const agentResponse = await createBackgroundAgent(
      fixPrompt,
      branchName || "nether-grasp-staging"
    );

    if (!agentResponse.success) {
      console.log("❌ Failed to create fix agent");
      return false;
    }

    const newAgentId = agentResponse.agentId;
    console.log(`✅ Fix agent created: ${newAgentId}`);

    // Copy retry info to new agent
    const retryInfo = agentRetryMap.get(failedAgentId) || {
      count: 0,
      original_agent_id: failedAgentId,
    };
    agentRetryMap.set(newAgentId, {
      count: retryInfo.count + 1,
      original_agent_id: retryInfo.original_agent_id,
    });

    // Update task with new agent ID and reset status to Running
    console.log(`📝 Updating task with new agent ${newAgentId}...`);
    const updateResponse = await fetchWithPortDiscovery(
      `${NEXT_APP_URL}/api/nether-grasp/tasks`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: task.id,
          agent_id: newAgentId,
          status: "Running",
          agent_status: "CREATING",
          retry_count: retryInfo.count + 1,
          previous_agent_id: failedAgentId,
        }),
      }
    );

    if (!updateResponse.ok) {
      console.log(`⚠️ Failed to update task: ${updateResponse.status}`);
      return false;
    }

    console.log("✅ Task updated with fix agent");

    // Notify frontend
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "deployment_retry",
          original_agent_id: failedAgentId,
          new_agent_id: newAgentId,
          retry_count: retryInfo.count + 1,
          max_retries: MAX_RETRIES,
          message: `Retry ${
            retryInfo.count + 1
          }/${MAX_RETRIES}: Fix agent created`,
        })
      );
    }

    // Start polling the new agent
    pollAgentStatus(newAgentId, ws);

    return true;
  } catch (error) {
    console.error("❌ Error during retry attempt:", error.message);
    return false;
  }
}

/**
 * Poll agent status until completion
 */
/**
 * Poll task API to detect when Vercel deployment succeeds
 * This replaces waiting for webhook callback (which can't reach localhost)
 */
function pollTaskDeploymentStatus(agentId, branchName, ws) {
  const pollInterval = 5000; // Poll every 5 seconds
  const maxPolls = 120; // Max 10 minutes (120 * 5 seconds)
  let pollCount = 0;

  console.log(
    `🔄 Starting task deployment status polling for agent ${agentId}...`
  );

  const poll = async () => {
    try {
      pollCount++;

      if (pollCount > maxPolls) {
        console.log("⏰ Max polling time reached for deployment status");
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "deployment_timeout",
              agent_id: agentId,
              message: "Deployment verification timed out after 10 minutes",
            })
          );
        }

        // Free the processing slot and start next task
        isProcessingTask = false;
        currentTaskId = null;
        console.log("🔓 Task processing slot freed after timeout");
        console.log("📋 Processing next task in queue...");
        processQueue();

        return;
      }

      // Fetch task from API
      const response = await fetchWithPortDiscovery(
        `${NEXT_APP_URL}/api/nether-grasp/tasks`
      );
      if (!response.ok) {
        console.log(`⚠️ Failed to fetch tasks: ${response.status}`);
        setTimeout(poll, pollInterval);
        return;
      }

      const data = await response.json();
      const task = data.tasks?.find((t) => t.agent_id === agentId);

      if (!task) {
        console.log(`⚠️ Task not found for agent ${agentId}`);
        setTimeout(poll, pollInterval);
        return;
      }

      console.log(
        `📊 Task status: ${task.status}, Agent status: ${task.agent_status} (poll ${pollCount}/${maxPolls})`
      );

      // REMOVED: Localhost bypass that was causing premature merges
      // Now ALWAYS wait for preview deployment to succeed (status = "Deploying")
      // before merging to main, regardless of localhost/production
      // This prevents merging failed preview deployments

      // Check if preview deployment succeeded (webhook set status to "Deploying")
      if (task.status === "Deploying") {
        console.log(
          "✅ Preview deployment succeeded! Webhook detected success."
        );
        console.log("🚀 Initiating auto-merge to main branch...");

        // Trigger the merge
        const pushResult = await pushToMainBranch(branchName);

        if (pushResult.success) {
          console.log("✅ Successfully merged and pushed to main!");
          console.log(
            "🎉 Task will be marked as Completed by production deployment webhook"
          );

          if (ws && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                type: "deployment_success",
                agent_id: agentId,
                status: "Deploying",
                branch_name: branchName,
                message:
                  "Preview succeeded, merged to main, waiting for production deployment",
              })
            );
          }

          // Continue polling to wait for production deployment to complete
          setTimeout(poll, pollInterval);
        } else {
          console.log("❌ Failed to merge to main:", pushResult.error);

          if (ws && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                type: "deployment_error",
                agent_id: agentId,
                status: "Error",
                message: `Failed to merge: ${pushResult.error}`,
              })
            );
          }

          // Free the processing slot and start next task
          isProcessingTask = false;
          currentTaskId = null;
          console.log("🔓 Task processing slot freed after merge failure");
          console.log("📋 Processing next task in queue...");
          processQueue();

          return; // Stop polling
        }
        return; // Don't continue to other checks in this iteration
      }

      // Check if production deployment succeeded (final status)
      if (task.status === "Completed") {
        console.log("✅ Production deployment succeeded!");
        console.log("🎉 Task completed successfully!");

        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "task_completed",
              agent_id: agentId,
              status: "Completed",
              message: "Production deployment succeeded, task completed",
            })
          );
        }

        // Free the processing slot and start next task
        isProcessingTask = false;
        currentTaskId = null;
        console.log(
          "🔓 Task processing slot freed after successful completion"
        );
        console.log("📋 Processing next task in queue...");
        processQueue();

        return; // Stop polling
      }

      // Check if deployment failed
      if (task.status === "Error") {
        console.log("❌ Preview deployment failed");
        console.log(
          "⚠️ Changes NOT merged to main (deployment errors detected)"
        );

        // Check retry attempts
        const retryInfo = agentRetryMap.get(agentId) || {
          count: 0,
          original_agent_id: agentId,
        };
        const retryCount = retryInfo.count;

        if (retryCount < MAX_RETRIES) {
          console.log(
            `🔄 Attempting automatic retry (${
              retryCount + 1
            }/${MAX_RETRIES})...`
          );

          // Attempt to retry with fix agent
          const retrySuccess = await attemptDeploymentRetry(agentId, task, ws);

          if (retrySuccess) {
            // Note: Retry tracking is handled inside attemptDeploymentRetry
            // A new agent polling cycle has been started, so we exit this one
            console.log("✅ Retry initiated, exiting old polling cycle");
            return; // Exit this polling loop, new agent has its own polling
          }
        }

        console.log(`❌ Max retries reached (${MAX_RETRIES}) or retry failed`);
        console.log(
          "⚠️ Changes NOT merged to main (deployment errors detected)"
        );

        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "deployment_error",
              agent_id: agentId,
              status: "Error",
              message: `Preview deployment failed after ${retryCount} retries`,
              retry_count: retryCount,
            })
          );
        }

        // Free the processing slot and start next task
        isProcessingTask = false;
        currentTaskId = null;
        console.log("🔓 Task processing slot freed after max retries");
        console.log("📋 Processing next task in queue...");
        processQueue();

        return; // Stop polling
      }

      // Still waiting - continue polling
      setTimeout(poll, pollInterval);
    } catch (error) {
      console.log(`⚠️ Error polling task status: ${error.message}`);
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling
  poll();
}

function pollAgentStatus(agentId, ws) {
  const pollInterval = 10000; // Poll every 10 seconds
  const maxPolls = 180; // Max 30 minutes (180 * 10 seconds)
  let pollCount = 0;

  const poll = async () => {
    try {
      const statusResponse = await checkAgentStatus(agentId);

      console.log(`📊 Agent ${agentId} status: ${statusResponse.status}`);

      // Send status update to frontend
      if (ws && ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "agent_status_update",
            agent_id: agentId,
            agent_status: statusResponse.status,
            response: statusResponse,
          })
        );
      }

      // Check if agent is finished
      if (statusResponse.status === "FINISHED") {
        console.log("✅ Agent completed successfully!");

        // Get the branch name the agent worked on
        const agentBranch =
          statusResponse.target?.branchName ||
          statusResponse.branchName ||
          null;
        console.log(`📋 Agent worked on branch: ${agentBranch || "unknown"}`);

        // Update task to mark agent as FINISHED so webhook can find it
        console.log("📝 Updating task agent_status to FINISHED...");
        try {
          const updateResponse = await fetchWithPortDiscovery(
            `${NEXT_APP_URL}/api/nether-grasp/tasks`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                agent_id: agentId,
                agent_status: "FINISHED",
                branch_name: agentBranch,
                status: "Running", // Keep as Running, waiting for deployment
              }),
            }
          );

          if (updateResponse.ok) {
            console.log("✅ Task updated - agent marked as FINISHED");
          } else {
            console.log(`⚠️ Failed to update task: ${updateResponse.status}`);
          }
        } catch (error) {
          console.log("⚠️ Error updating task:", error.message);
        }

        // DO NOT auto-push to main immediately!
        // Instead, wait for Vercel preview deployment to succeed
        console.log("⏳ Waiting for Vercel preview deployment webhook...");
        console.log(
          "💡 Polling task API to detect when preview deployment succeeds..."
        );

        // Notify frontend that agent is done, but waiting for preview deployment
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "agent_completed",
              agent_id: agentId,
              agent_status: "FINISHED",
              branch_name: agentBranch,
              git_push: {
                success: null, // Not pushed yet
                message:
                  "Agent completed, waiting for Vercel preview deployment to succeed",
              },
            })
          );
        }

        // DO NOT free the processing slot yet!
        // Keep isProcessingTask = true until deployment completes
        console.log(
          "⏳ Keeping task processing slot locked until deployment completes"
        );
        console.log(
          "🔒 Queue is paused - next task will start after deployment"
        );

        // Start polling task API to detect deployment success
        // This will call processQueue() when deployment completes
        pollTaskDeploymentStatus(agentId, agentBranch, ws);

        return; // Stop polling agent status
      } else if (
        statusResponse.status === "ERROR" ||
        statusResponse.status === "EXPIRED"
      ) {
        console.log("❌ Agent failed or expired");

        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "agent_error",
              agent_id: agentId,
              agent_status: statusResponse.status,
            })
          );
        }

        // Note: Task status will be updated by frontend when it receives agent_error message
        // Agent error means no deployment will happen, so we can free the slot

        // Mark current task as no longer processing
        isProcessingTask = false;
        currentTaskId = null;
        console.log(
          "🔓 Task processing slot freed after agent error - queue can continue"
        );

        // Process next task in queue
        console.log("📋 Processing next task in queue...");
        processQueue();

        return; // Stop polling
      }

      // Continue polling if still running
      pollCount++;
      if (pollCount < maxPolls) {
        setTimeout(poll, pollInterval);
      } else {
        console.log("⏱️  Max polling time reached, stopping status updates");

        // Free the processing slot and start next task
        isProcessingTask = false;
        currentTaskId = null;
        console.log("🔓 Task processing slot freed after agent status timeout");
        console.log("📋 Processing next task in queue...");
        processQueue();
      }
    } catch (error) {
      console.error("Error polling agent status:", error.message);
      pollCount++;
      if (pollCount < maxPolls) {
        setTimeout(poll, pollInterval);
      }
    }
  };

  // Start polling after initial delay
  setTimeout(poll, pollInterval);
}

/**
 * Check agent status via API
 */
async function checkAgentStatus(agentId) {
  return new Promise((resolve, reject) => {
    const apiUrl = `${CURSOR_API_BASE_URL}/v0/agents/${agentId}`;
    const parsedUrl = new URL(apiUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: "GET",
      headers: {
        Authorization: `Bearer ${CURSOR_API_KEY}`,
        "User-Agent": "Nether-Bridge/1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (err) {
            reject(new Error("Failed to parse status response"));
          }
        } else {
          reject(new Error(`Status check failed: ${res.statusCode}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Status check request failed: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Get GitHub repository URL from git remote
 */
function getGitHubRepoUrl() {
  return new Promise((resolve, reject) => {
    exec(
      "git remote get-url origin",
      { cwd: __dirname, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              "No git repository found. Background Agents require a GitHub repository."
            )
          );
          return;
        }

        let repoUrl = stdout.trim();

        // Convert SSH to HTTPS format
        // git@github.com:user/repo.git -> https://github.com/user/repo
        if (repoUrl.startsWith("git@github.com:")) {
          repoUrl = repoUrl.replace("git@github.com:", "https://github.com/");
        }

        // Remove .git suffix
        repoUrl = repoUrl.replace(/\.git$/, "");

        resolve(repoUrl);
      }
    );
  });
}

/**
 * Get current git branch
 */
function getCurrentBranch() {
  return new Promise((resolve, reject) => {
    exec(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: __dirname, encoding: "utf-8" },
      (error, stdout) => {
        if (error) {
          resolve("main"); // default to main
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

/**
 * Create a Background Agent using Cursor's API
 */
async function createBackgroundAgent(
  promptText,
  stagingBranch = "nether-grasp-staging"
) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get GitHub repository URL
      const repoUrl = await getGitHubRepoUrl();

      console.log(`📂 Repository: ${repoUrl}`);
      console.log(`🌿 Staging Branch: ${stagingBranch}`);
      console.log(`🤖 Model: claude-4.5-sonnet`);

      const apiUrl = `${CURSOR_API_BASE_URL}/v0/agents`;
      const parsedUrl = new URL(apiUrl);

      // Prepare the request payload according to official docs
      // https://docs.cursor.com/en/background-agent/api/launch-an-agent
      const payload = JSON.stringify({
        prompt: {
          text: promptText,
        },
        source: {
          repository: repoUrl,
          ref: stagingBranch, // Use staging branch where files were pushed
        },
        // Specify Claude Sonnet 4.5 model
        model: "claude-4.5-sonnet",
      });

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${CURSOR_API_KEY}`,
          "User-Agent": "Nether-Bridge/1.0",
        },
      };

      console.log(`📡 Calling Cursor API: ${apiUrl}`);
      console.log(`📦 Payload: ${payload}`);
      console.log(`🔑 Auth: Bearer ${CURSOR_API_KEY.substring(0, 20)}...`);

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          console.log(`📨 API Response Status: ${res.statusCode}`);
          console.log(`📨 API Response: ${data}`);

          if (res.statusCode === 201 || res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              resolve({
                success: true,
                agentId: response.id || "unknown",
                url: response.target?.url || response.url || response.webUrl,
                response: response,
              });
            } catch (err) {
              resolve({
                success: true,
                agentId: "created",
                response: data,
              });
            }
          } else if (res.statusCode === 401) {
            reject(
              new Error(`Authentication failed (401). Check your API key.`)
            );
          } else if (res.statusCode === 403) {
            reject(
              new Error(
                `Permission denied (403). Your plan may not support Background Agents, or the repository isn't accessible.`
              )
            );
          } else if (res.statusCode === 400) {
            reject(
              new Error(`Bad request (400): ${data}. Check payload format.`)
            );
          } else {
            reject(new Error(`API returned ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`API request failed: ${error.message}`));
      });

      req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Handle deployment errors from Vercel webhook
 */
function handleDeploymentError(message, ws) {
  const { deployment, error } = message;

  console.log("\n❌ DEPLOYMENT ERROR RECEIVED");
  console.log(`📦 Deployment: ${deployment?.id}`);
  console.log(`🔗 URL: ${deployment?.url}`);
  console.log(`📊 Error Analysis:`, error?.analysis);

  // Check if error is auto-fixable
  if (error?.analysis?.isAutoFixable) {
    console.log(
      "🤖 Error is auto-fixable - creating fix agent automatically..."
    );

    // Create fix prompt
    const fixPrompt = createFixPrompt(error);

    // Automatically trigger fix agent
    triggerCursorChat("auto-fix", fixPrompt, ws, {
      taskType: "auto-fix",
      originalError: error.logs,
      deploymentUrl: deployment?.url,
      componentPath: error.analysis?.componentPath,
    });
  } else {
    console.log("⚠️ Error requires manual review - not auto-fixable");

    // Notify frontend to show manual fix button
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "deployment_error_manual",
          deployment: deployment,
          error: error,
          message: "Deployment error requires manual review",
        })
      );
    }
  }
}

/**
 * Manually trigger fix agent from UI
 */
function triggerFixAgent(message, ws) {
  const { error_info } = message;

  console.log("\n🔧 MANUAL FIX AGENT TRIGGERED");
  console.log(`📁 Component: ${error_info?.analysis?.componentPath}`);

  // Create fix prompt
  const fixPrompt = createFixPrompt(error_info);

  // Trigger fix agent
  triggerCursorChat("manual-fix", fixPrompt, ws, {
    taskType: "auto-fix",
    originalError: error_info?.logs,
    componentPath: error_info?.analysis?.componentPath,
  });
}

/**
 * Check agent status on reconnection and sync with frontend
 */
async function checkAndSyncAgentStatus(message, ws) {
  const { agent_id } = message;

  if (!agent_id) {
    console.warn("⚠️ No agent_id provided for status check");
    return;
  }

  console.log(`🔍 Checking status for agent: ${agent_id}`);

  try {
    const statusResponse = await checkAgentStatus(agent_id);
    console.log(`📊 Agent ${agent_id} status: ${statusResponse.status}`);

    // Send status update to frontend
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "agent_status_update",
          agent_id: agent_id,
          agent_status: statusResponse.status,
          response: statusResponse,
        })
      );
    }

    // If agent finished while client was disconnected, send completion message
    if (statusResponse.status === "FINISHED") {
      console.log(
        "✅ Agent finished while client was disconnected - syncing completion"
      );

      // Get the branch name the agent worked on
      const agentBranch =
        statusResponse.target?.branchName || statusResponse.branchName || null;
      console.log(`📋 Agent worked on branch: ${agentBranch || "unknown"}`);

      // Update task to mark agent as FINISHED so webhook can find it
      console.log("📝 Updating task agent_status to FINISHED...");
      try {
        const updateResponse = await fetchWithPortDiscovery(
          `${NEXT_APP_URL}/api/nether-grasp/tasks`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_id: agent_id,
              agent_status: "FINISHED",
              branch_name: agentBranch,
              status: "Running",
            }),
          }
        );

        if (updateResponse.ok) {
          console.log("✅ Task updated - agent marked as FINISHED");
        }
      } catch (error) {
        console.log("⚠️ Error updating task:", error.message);
      }

      // DO NOT auto-push - wait for Vercel preview deployment webhook
      console.log("⏳ Waiting for Vercel preview deployment webhook...");

      if (ws && ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "agent_completed",
            agent_id: agent_id,
            agent_status: "FINISHED",
            branch_name: agentBranch,
            git_push: {
              success: null,
              message:
                "Agent completed, waiting for Vercel preview deployment to succeed",
            },
          })
        );
      }
    } else if (
      statusResponse.status === "ERROR" ||
      statusResponse.status === "EXPIRED"
    ) {
      console.log(
        "❌ Agent failed while client was disconnected - syncing error"
      );

      if (ws && ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "agent_error",
            agent_id: agent_id,
            agent_status: statusResponse.status,
          })
        );
      }
    }
  } catch (error) {
    console.error("❌ Error checking agent status:", error.message);
  }
}

/**
 * Create a detailed fix prompt from error information
 */
function createFixPrompt(errorInfo) {
  const analysis = errorInfo?.analysis;
  const logs = errorInfo?.logs || "";

  let prompt = `🚨 DEPLOYMENT ERROR - FIX REQUIRED

A recent deployment to Vercel failed with the following error:

\`\`\`
${logs}
\`\`\`

`;

  if (analysis?.componentPath) {
    prompt += `📁 **File**: ${analysis.componentPath}\n`;
  }

  if (analysis?.lineNumber) {
    prompt += `📍 **Line**: ${analysis.lineNumber}\n`;
  }

  prompt += `❌ **Error**: ${analysis?.errorMessage || "Unknown error"}\n`;
  prompt += `🏷️ **Type**: ${analysis?.errorType || "unknown"}\n\n`;

  prompt += `**Instructions:**
1. Find and open the file: ${analysis?.componentPath || "the affected file"}
2. Navigate to line ${analysis?.lineNumber || "the error location"}
3. Analyze the TypeScript error carefully
4. Fix the error with the appropriate solution:
   - For undefined/null errors: Add null checks (optional chaining ?. or nullish coalescing ??)
   - For type mismatches: Correct the type definitions
   - For syntax errors: Fix the syntax
5. Ensure the code compiles without errors
6. Test that the fix doesn't break existing functionality
7. Commit the changes with message: "fix: ${
    analysis?.errorMessage || "Fix deployment error"
  }"

**IMPORTANT**: 
- Only fix this specific error
- Do NOT make unrelated changes
- Follow the project's TypeScript strict mode settings
- Ensure all types are properly defined
`;

  return prompt;
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down Nether Bridge Server...");
  wss.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

wss.on("error", (err) => {
  console.error("❌ Server error:", err);
  process.exit(1);
});
