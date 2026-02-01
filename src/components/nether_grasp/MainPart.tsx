"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import "./_css/MainPart.css";
import ButtonRow from "~/components/nether_grasp/main_part/ButtonRow";
import TextArea from "~/components/nether_grasp/main_part/TextArea";
import ButtonLight from "~/components/nether_grasp/main_part/ButtonLight";
import PromptDisplay from "~/components/nether_grasp/main_part/PromptDisplay";

// Simple HTML beautifier
function beautifyHTML(html: string): string {
  let formatted = "";
  let indent = 0;
  const tab = "  ";

  html.split(/>\s*</).forEach((node, index) => {
    if (index > 0) formatted += "\n";

    if (/^\/\w/.test(node)) indent--;
    formatted += tab.repeat(Math.max(0, indent)) + "<" + node + ">";
    if (
      /^<?\w[^>]*[^\/]$/.test(node) &&
      !node.startsWith("input") &&
      !node.startsWith("br") &&
      !node.startsWith("hr") &&
      !node.startsWith("img")
    ) {
      indent++;
    }
  });

  return formatted.substring(1, formatted.length - 1);
}

// Simple CSS beautifier
function beautifyCSS(css: string): string {
  const formatted = css
    .replace(/\s*{\s*/g, " {\n  ")
    .replace(/;\s*/g, ";\n  ")
    .replace(/\s*}\s*/g, "\n}\n\n")
    .replace(/,\s*/g, ",\n")
    .trim();

  return formatted;
}

interface MainPartProps {
  isNavbarVisible?: boolean;
}

// WebSocket message types
interface BaseMessage {
  type: string;
  message?: string;
}

interface ConnectionMessage extends BaseMessage {
  type: "connection";
  message: string;
}

interface PromptReceivedMessage extends BaseMessage {
  type: "prompt_received";
  file: string;
  promptId: string;
}

interface AgentCreatedMessage extends BaseMessage {
  type: "agent_created";
  agent_id: string;
  agent_status: string;
  agent_url?: string;
  branch_name: string;
  metadata?: {
    componentName?: string;
    componentDirectory?: string;
    pageName?: string;
  };
}

interface AgentFailedMessage extends BaseMessage {
  type: "agent_failed";
  file: string;
  metadata?: {
    componentName?: string;
    componentDirectory?: string;
    pageName?: string;
    stagingBranch?: string;
  };
}

interface AgentStatusUpdateMessage extends BaseMessage {
  type: "agent_status_update";
  agent_id: string;
  agent_status: string;
}

interface AgentCompletedMessage extends BaseMessage {
  type: "agent_completed";
  agent_id: string;
  git_push?: {
    success: boolean;
    message: string;
    error?: string;
    details?: {
      branch: string;
      message: string;
      output: string;
    };
  };
}

interface AgentErrorMessage extends BaseMessage {
  type: "agent_error";
  agent_id: string;
  agent_status: string;
}

interface ErrorMessage extends BaseMessage {
  type: "error";
  message: string;
}

interface PongMessage extends BaseMessage {
  type: "pong";
}

interface TaskQueuedMessage extends BaseMessage {
  type: "task_queued";
  task_id: number;
  queue_position: number;
  total_in_queue: number;
  metadata?: {
    componentName?: string;
    componentDirectory?: string;
    pageName?: string;
  };
}

type WebSocketMessage =
  | ConnectionMessage
  | PromptReceivedMessage
  | AgentCreatedMessage
  | AgentFailedMessage
  | AgentStatusUpdateMessage
  | AgentCompletedMessage
  | AgentErrorMessage
  | ErrorMessage
  | PongMessage
  | TaskQueuedMessage;

export default function MainPart({ isNavbarVisible = true }: MainPartProps) {
  const [urlValue, setUrlValue] = useState("");
  const [htmlValue, setHtmlValue] = useState("");
  const [cssValue, setCssValue] = useState("");
  const [componentName, setComponentName] = useState("");
  const [componentDirectory, setComponentDirectory] = useState("");
  const [pageName, setPageName] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [tasks, setTasks] = useState<
    Array<{
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
      agent_id: string | null;
      agent_status: string | null;
    }>
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch tasks from API
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/nether-grasp/tasks");
      if (response.ok) {
        const data = (await response.json()) as { tasks: typeof tasks };
        setTasks(data.tasks ?? []);
        console.log("✅ Tasks loaded:", data.tasks?.length ?? 0);
      }
    } catch (error) {
      console.error("❌ Failed to fetch tasks:", error);
    }
  }, []);

  // Load tasks on mount
  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  // Log tasks whenever they change
  useEffect(() => {
    if (tasks.length > 0) {
      console.log("📋 Current Tasks:", tasks);
      console.log(
        `📊 Task Summary: ${tasks.length} total, ${
          tasks.filter((t) => t.status === "Running").length
        } running, ${
          tasks.filter((t) => t.status === "Completed").length
        } completed`
      );
    }
  }, [tasks]);

  const handleHTMLPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const beautified = beautifyHTML(pastedText);
    setHtmlValue(beautified);
    // React will update the DOM through the state change
  };

  const handleCSSPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const beautified = beautifyCSS(pastedText);
    setCssValue(beautified);
    // React will update the DOM through the state change
  };

  // Sync pending/running tasks after reconnection
  const syncPendingTasks = useCallback(async (ws: WebSocket) => {
    try {
      // Fetch current tasks
      const response = await fetch("/api/nether-grasp/tasks");
      if (!response.ok) return;

      const data = (await response.json()) as { tasks: typeof tasks };
      const tasksToCheck =
        data.tasks?.filter(
          (task) =>
            (task.status === "Pending" || task.status === "Running") &&
            task.agent_id
        ) ?? [];

      if (tasksToCheck.length === 0) {
        console.log("ℹ️ No pending/running tasks to sync");
        return;
      }

      console.log(`🔄 Syncing ${tasksToCheck.length} pending/running tasks...`);

      // Request status update for each task
      tasksToCheck.forEach((task) => {
        if (ws.readyState === WebSocket.OPEN && task.agent_id) {
          ws.send(
            JSON.stringify({
              type: "check_agent_status",
              agent_id: task.agent_id,
            })
          );
          console.log(`📤 Requesting status for agent: ${task.agent_id}`);
        }
      });
    } catch (error) {
      console.error("❌ Failed to sync pending tasks:", error);
    }
  }, []);

  // WebSocket connection management
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket("ws://localhost:3939");
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("✅ Connected to Nether Bridge Server");
          setWsConnected(true);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          // Sync pending/running tasks status after reconnection
          void syncPendingTasks(ws);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as WebSocketMessage;
            console.log("📨 Received message:", message);

            switch (message.type) {
              case "connection":
                console.log("✅ Connection confirmed:", message.message);
                break;
              case "task_queued":
                console.log("📋 Task queued:", message);
                console.log(`   Position in queue: ${message.queue_position}`);
                console.log(`   Total in queue: ${message.total_in_queue}`);
                // Task already added to database by bridge server with Queued status
                // Just refresh the task list
                void fetchTasks();
                break;
              case "prompt_received":
                console.log("✅ Prompt received by bridge:", message);
                // Prompt sent - no alert needed, agent will be created next
                break;
              case "agent_created":
                console.log("✅ Background Agent created:", message);
                console.log("📋 Metadata received:", message.metadata);

                // Update task from Queued to Running with agent info
                if (message.agent_id) {
                  console.log(
                    "💾 Updating task with agent info:",
                    message.agent_id
                  );

                  const patchBody = {
                    ComponentName: message.metadata?.componentName,
                    agent_id: message.agent_id,
                    agent_status: message.agent_status,
                    agent_url: message.agent_url,
                    branch_name: message.branch_name,
                    status: "Running",
                  };
                  console.log("📤 PATCH request body:", patchBody);

                  // Try to find existing queued task and update it
                  fetch("/api/nether-grasp/tasks", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(patchBody),
                  })
                    .then(async (res) => {
                      console.log(
                        "📥 PATCH response status:",
                        res.status,
                        res.statusText
                      );
                      if (res.ok) {
                        const data = (await res.json()) as { success: boolean };
                        console.log(
                          "✅ Task updated to Running with agent tracking:",
                          data
                        );
                        // Refresh task list
                        await fetchTasks();
                      } else {
                        const errorText = await res.text();
                        console.error(
                          "❌ Failed to update task. Status:",
                          res.status
                        );
                        console.error("❌ Response body:", errorText);
                        try {
                          const error = JSON.parse(errorText) as {
                            error: string;
                          };
                          console.error("❌ Parsed error:", error);
                        } catch {
                          console.error("❌ Could not parse error response");
                        }
                      }
                    })
                    .catch((err) => {
                      console.error(
                        "❌ Error updating task (network or other):",
                        err
                      );
                    });
                }
                // Agent created - no alert needed, visible in task list
                break;
              case "agent_failed":
                console.error("❌ Agent creation failed:", message);

                // Still create a task entry even when agent creation fails
                if (message.metadata) {
                  const taskData = {
                    ComponentName: message.metadata?.componentName,
                    component_directory: message.metadata?.componentDirectory,
                    PageName: message.metadata?.pageName,
                    agent_id: null,
                    agent_status: null,
                    agent_url: null,
                    branch_name: message.metadata?.stagingBranch ?? null,
                  };

                  console.log(
                    "💾 Saving task (CLI fallback method):",
                    taskData
                  );

                  fetch("/api/nether-grasp/tasks", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(taskData),
                  })
                    .then(async (res) => {
                      if (res.ok) {
                        const result = (await res.json()) as {
                          success: boolean;
                        };
                        console.log(
                          "✅ Task added to list (CLI fallback):",
                          result
                        );
                        // Refresh task list
                        await fetchTasks();
                      }
                    })
                    .catch((err) => {
                      console.error("❌ Error saving task:", err);
                    });
                }
                // Agent failed - CLI method used instead, check console for details
                break;
              case "agent_status_update":
                console.log(`📊 Agent status update: ${message.agent_status}`);
                // Update task status in real-time
                setTasks((prevTasks) =>
                  prevTasks.map((task) =>
                    task.agent_id === message.agent_id
                      ? { ...task, agent_status: message.agent_status }
                      : task
                  )
                );
                break;
              case "agent_completed":
                console.log("✅ Agent completed work!");

                const gitPushInfo = message.git_push;

                // Check git push status
                if (gitPushInfo?.success === null) {
                  // Agent finished, waiting for Vercel preview deployment
                  console.log(
                    "⏳ Agent completed - waiting for Vercel preview deployment to succeed"
                  );

                  // Keep status as "Running" until preview deployment succeeds
                  void fetchTasks();
                } else if (gitPushInfo?.success === false) {
                  // Git push failed immediately
                  console.warn(
                    `⚠️ ${gitPushInfo.message} - Error: ${gitPushInfo.error}`
                  );

                  void fetch("/api/nether-grasp/tasks", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      agent_id: message.agent_id,
                      status: "Error",
                      agent_status: "ERROR",
                    }),
                  }).then(async () => {
                    await fetchTasks();
                  });
                } else if (gitPushInfo?.success === true) {
                  // This shouldn't happen anymore (we wait for preview first)
                  // But keep for backwards compatibility
                  console.log(
                    "🚀 Task marked as deploying - waiting for Vercel deployment confirmation"
                  );

                  void fetch("/api/nether-grasp/tasks", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      agent_id: message.agent_id,
                      status: "Deploying",
                      agent_status: "FINISHED",
                    }),
                  }).then(async () => {
                    await fetchTasks();
                  });
                }
                break;
              case "agent_error":
                console.error("❌ Agent encountered an error");
                // Update task status to Error
                void fetch("/api/nether-grasp/tasks", {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    agent_id: message.agent_id,
                    status: "Error",
                    agent_status: message.agent_status,
                  }),
                })
                  .then(async (res) => {
                    if (res.ok) {
                      console.log("❌ Task marked as error");
                      // Refresh task list
                      await fetchTasks();
                      // Agent error - no alert needed, status visible in task list
                    }
                  })
                  .catch((error) => {
                    console.error("Error updating task:", error);
                  });
                break;
              case "error":
                console.error("❌ Bridge error:", message.message);
                alert(`❌ Error: ${message.message}`);
                break;
              case "pong":
                // Health check response
                break;
              default:
                console.log(
                  "📨 Unknown message type:",
                  (message as BaseMessage).type
                );
            }
          } catch (err) {
            console.error("❌ Error parsing message:", err);
          }
        };

        ws.onerror = (error) => {
          console.error("❌ WebSocket error:", error);
          setWsConnected(false);
        };

        ws.onclose = () => {
          console.log("👋 WebSocket disconnected");
          setWsConnected(false);
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current ??= setTimeout(() => {
            console.log("🔄 Attempting to reconnect...");
            reconnectTimeoutRef.current = null;
            connectWebSocket();
          }, 3000);
        };
      } catch (err) {
        console.error("❌ Failed to connect to WebSocket:", err);
        setWsConnected(false);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [fetchTasks, syncPendingTasks]);

  const handleBeautify = () => {
    if (htmlValue) {
      setHtmlValue(beautifyHTML(htmlValue));
    }
    if (cssValue) {
      setCssValue(beautifyCSS(cssValue));
    }
  };

  const handleScript = async () => {
    if (!htmlValue.trim()) {
      console.log("Please paste HTML in the HTML Input field first!");
      return;
    }

    // Beautify HTML
    const beautified = beautifyHTML(htmlValue);
    setHtmlValue(beautified);

    // Extract all class names from the HTML
    const classRegex = /class(?:Name)?=["']([^"']+)["']/g;
    const classSet = new Set<string>();
    let match;

    while ((match = classRegex.exec(htmlValue)) !== null) {
      if (match[1]) {
        const classes = match[1].split(/\s+/);
        classes.forEach((cls) => {
          if (cls.trim()) {
            classSet.add(cls.trim());
          }
        });
      }
    }

    if (classSet.size === 0) {
      console.log("No classes found in the HTML!");
      return;
    }

    const classes = Array.from(classSet);
    const classesFormatted = classes.map((cls) => `      "${cls}",`).join("\n");

    // Generate the CSS extraction script
    const script = [
      "// ============================================================",
      "// CSS EXTRACTION SCRIPT - Auto-generated by Nether Grasp",
      "// ============================================================",
      "// Instructions:",
      "// 1. Open the page with the component you want to extract CSS from",
      "// 2. Paste this entire script in the browser console",
      "// 3. Press Enter - CSS will be copied to your clipboard",
      "// 4. Paste the CSS wherever you need it",
      "// ============================================================",
      "",
      "(function () {",
      "  const CONFIG = {",
      '    componentName: "EXTRACTED_COMPONENT",',
      '    outputFilename: "extracted-styles",',
      "    ",
      "    // Auto-detected classes from your HTML:",
      "    classesToExtract: [",
      classesFormatted,
      "    ],",
      "  };",
      "",
      "  console.log('Starting ' + CONFIG.componentName + ' CSS extraction...');",
      "",
      "  const classSet = new Set(CONFIG.classesToExtract);",
      "  let extractedCSS = [];",
      "  let extractedRules = new Set();",
      "",
      "  function shouldIncludeRule(selectorText) {",
      "    if (!selectorText) return false;",
      "",
      "    for (let className of classSet) {",
      "      if (",
      '        selectorText.includes("." + className) ||',
      '        (className.includes("-") && selectorText.includes(className))',
      "      ) {",
      "        return true;",
      "      }",
      "    }",
      "    return false;",
      "  }",
      "",
      "  function cleanCSSRule(cssText) {",
      "    let cleaned = cssText;",
      "    cleaned = cleaned.replace(/[a-z-]+:\\\\s*unset;?\\\\s*/gi, '');",
      "    if (cleaned.match(/\\\\{\\\\s*\\\\}/)) {",
      "      return null;",
      "    }",
      "    cleaned = cleaned.replace(/\\\\s+/g, ' ').trim();",
      "    return cleaned;",
      "  }",
      "",
      "  Array.from(document.styleSheets).forEach((styleSheet, sheetIndex) => {",
      "    try {",
      "      const rules = styleSheet.cssRules || styleSheet.rules;",
      "      if (!rules) return;",
      "",
      "      console.log('Processing stylesheet ' + (sheetIndex + 1) + '/' + document.styleSheets.length);",
      "",
      "      Array.from(rules).forEach((rule) => {",
      "        try {",
      "          if (rule.type === CSSRule.STYLE_RULE) {",
      "            if (shouldIncludeRule(rule.selectorText)) {",
      "              const ruleText = rule.cssText;",
      "              const cleaned = cleanCSSRule(ruleText);",
      "              if (cleaned && !extractedRules.has(cleaned)) {",
      "                extractedRules.add(cleaned);",
      "                extractedCSS.push(cleaned);",
      "              }",
      "            }",
      "          }",
      "          else if (rule.type === CSSRule.MEDIA_RULE) {",
      "            let mediaRules = [];",
      "            Array.from(rule.cssRules).forEach((innerRule) => {",
      "              if (shouldIncludeRule(innerRule.selectorText)) {",
      "                const cleaned = cleanCSSRule(innerRule.cssText);",
      '                if (cleaned) mediaRules.push("  " + cleaned);',
      "              }",
      "            });",
      "            if (mediaRules.length > 0) {",
      "              const mediaRule = '@media ' + rule.media.mediaText + ' {\\\\n' + mediaRules.join('\\\\n') + '\\\\n}';",
      "              if (!extractedRules.has(mediaRule)) {",
      "                extractedRules.add(mediaRule);",
      "                extractedCSS.push(mediaRule);",
      "              }",
      "            }",
      "          }",
      "          else if (rule.type === CSSRule.KEYFRAMES_RULE) {",
      "            const keyframeRule = rule.cssText;",
      "            if (!extractedRules.has(keyframeRule)) {",
      "              extractedRules.add(keyframeRule);",
      "              extractedCSS.push(keyframeRule);",
      "            }",
      "          }",
      "        } catch (e) {",
      "          // Skip inaccessible rules",
      "        }",
      "      });",
      "    } catch (e) {",
      "      console.warn('Warning: Could not access stylesheet ' + (sheetIndex + 1) + ' (likely CORS):', e.message);",
      "    }",
      "  });",
      "",
      "  const finalCSS = '/* Extracted CSS - Generated on ' + new Date().toISOString() + ' */\\\\n' +",
      "    '/* Note: unset values have been filtered out for cleaner CSS */\\\\n' +",
      "    '/* Warning: May require custom fonts (e.g., PixelGridS) - check original page */\\\\n\\\\n' +",
      "    extractedCSS.join('\\\\n\\\\n');",
      "",
      "  console.log('Extracted ' + extractedCSS.length + ' CSS rules');",
      "  console.log('Total CSS size: ' + (finalCSS.length / 1024).toFixed(2) + ' KB');",
      "",
      "  async function copyToClipboard() {",
      "    try {",
      "      await navigator.clipboard.writeText(finalCSS);",
      "      console.log('CSS copied to clipboard successfully!');",
      "      alert('CSS copied to clipboard!\\\\n\\\\n' + extractedCSS.length + ' rules extracted\\\\nSize: ' + (finalCSS.length / 1024).toFixed(2) + ' KB');",
      "    } catch (err) {",
      "      console.error('Failed to copy to clipboard:', err);",
      "      const textarea = document.createElement('textarea');",
      "      textarea.value = finalCSS;",
      "      textarea.style.position = 'fixed';",
      "      textarea.style.opacity = '0';",
      "      document.body.appendChild(textarea);",
      "      textarea.select();",
      "      try {",
      "        document.execCommand('copy');",
      "        console.log('CSS copied to clipboard using fallback method');",
      "        alert('CSS copied to clipboard!\\\\n\\\\n' + extractedCSS.length + ' rules extracted\\\\nSize: ' + (finalCSS.length / 1024).toFixed(2) + ' KB');",
      "      } catch (e) {",
      "        console.error('Fallback copy failed:', e);",
      "        alert('Failed to copy to clipboard. Please copy manually from console.');",
      "      }",
      "      document.body.removeChild(textarea);",
      "    }",
      "  }",
      "",
      "  console.log('\\\\nPreview of extracted CSS:');",
      "  console.log(finalCSS.substring(0, 500) + '...\\\\n');",
      "  console.log('Copying to clipboard...');",
      "",
      "  copyToClipboard().then(() => {",
      "    console.log('CSS extraction complete!');",
      "  });",
      "",
      "  return 'CSS extraction initiated...';",
      "})();",
    ].join("\n");

    // Copy script to clipboard
    try {
      await navigator.clipboard.writeText(script);
      console.log(
        `Script copied to clipboard! Found ${classes.length} classes.`
      );
    } catch {
      // Fallback for older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = script;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        if (textarea.parentNode === document.body) {
          document.body.removeChild(textarea);
        }
        console.log(
          `Script copied to clipboard! Found ${classes.length} classes.`
        );
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
      }
    }
  };

  const handleNetherGrasp = async () => {
    // Validate inputs
    if (!htmlValue.trim()) {
      alert("Please add HTML content first!");
      return;
    }
    if (!cssValue.trim()) {
      alert("Please add CSS content first!");
      return;
    }
    if (!componentName.trim()) {
      alert("Please enter a ComponentName!");
      return;
    }
    if (!componentDirectory.trim()) {
      alert("Please enter a component_directory!");
      return;
    }
    if (!pageName.trim()) {
      alert("Please enter a PageName!");
      return;
    }

    try {
      // Save files to nether-grasp directory
      const response = await fetch("/api/nether-grasp/save-files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          componentName: componentName,
          html: htmlValue,
          css: cssValue,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save files");
      }

      const result = (await response.json()) as {
        success: boolean;
        htmlPath: string;
        cssPath: string;
        stagingBranch: string;
      };

      // Generate Cursor prompt
      const prompt = `I've added a css file and an html file inside /nether-grasp/${componentName} at the root of this project. 

You should use both of them to make them into a component named ${componentName}

This component will be located at ${componentDirectory}.

Once you're done, delete both the css and html files from the /nether-grasp folder and push the changes to the repository.`;

      console.log("✅ Files saved:", result);
      console.log(`✅ Files pushed to branch: ${result.stagingBranch}`);
      console.log("📝 Generated prompt:", prompt);

      // Send prompt via WebSocket to bridge server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const message = {
          type: "send_prompt",
          prompt: prompt,
          metadata: {
            source: "nether-grasp",
            timestamp: new Date().toISOString(),
            hasCSS: !!cssValue.trim(),
            hasHTML: !!htmlValue.trim(),
            componentName: componentName,
            componentDirectory: componentDirectory,
            pageName: pageName,
            stagingBranch: result.stagingBranch,
          },
        };

        wsRef.current.send(JSON.stringify(message));
        console.log("📤 Sent prompt to bridge server");
      } else {
        // WebSocket not connected - show manual copy option
        console.warn("⚠️ WebSocket not connected, showing manual copy option");
        setGeneratedPrompt(prompt);
        setShowPrompt(true);
        alert(
          `⚠️ Bridge server not connected!\n\n📁 Files saved:\n- ${result.htmlPath}\n- ${result.cssPath}\n\n🔌 Please start the bridge server:\n\`npm run nether-bridge\`\n\nOr copy the prompt manually.`
        );
      }
    } catch (error) {
      console.error("Error:", error);
      alert(
        "❌ Error: " +
          (error instanceof Error ? error.message : "Failed to save files")
      );
    }
  };

  const buttons = [
    {
      text: "Beautify",
      onClick: handleBeautify,
      icon: (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
            <path d="M4.677 21.5a2 2 0 0 0 1.313.5H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v2.5"></path>
            <g
              style={{
                transform: "none",
                transformOrigin: "50% 50%",
                transformBox: "fill-box",
              }}
            >
              <path d="m3.2 12.9-.9-.4"></path>
              <path d="m3.2 15.1-.9.4"></path>
              <path d="m4.9 11.2-.4-.9"></path>
              <path d="m4.9 16.8-.4.9"></path>
              <path d="m7.5 10.3-.4.9"></path>
              <path d="m7.5 17.7-.4-.9"></path>
              <path d="m9.7 12.5-.9.4"></path>
              <path d="m9.7 15.5-.9-.4"></path>
              <circle cx="6" cy="14" r="3"></circle>
            </g>
          </svg>
        </>
      ),
    },
    {
      text: "Search",
      onClick: handleBeautify,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-list-filter h-3 w-3"
        >
          <path d="M3 6h18"></path>
          <path d="M7 12h10"></path>
          <path d="M10 18h4"></path>
        </svg>
      ),
    },
    {
      text: "Script",
      onClick: handleScript,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: "none" }}
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
        </svg>
      ),
    },
  ];

  return (
    <>
      {showPrompt && (
        <PromptDisplay
          prompt={generatedPrompt}
          onClose={() => setShowPrompt(false)}
        />
      )}
      <div className="nether-grasp-main z-0 flex h-full flex-1 flex-col overflow-hidden">
        <div className="nether-grasp-overlay flex h-full flex-col">
          <div
            className={`flex items-center justify-between p-8 ${
              !isNavbarVisible ? "pl-16" : ""
            }`}
          >
            <h1 className="nether-grasp-title text-4xl font-bold">
              NetherGrasp
            </h1>
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  wsConnected ? "animate-pulse bg-green-500" : "bg-red-500"
                }`}
                title={
                  wsConnected
                    ? "Connected to Bridge Server"
                    : "Bridge Server Disconnected"
                }
              />
              <span className="text-sm text-gray-400">
                {wsConnected ? "Bridge Connected" : "Bridge Disconnected"}
              </span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-[640px] px-8 pb-[200px]">
              <div data-fullscreen-input="true">
                <TextArea
                  placeholder="Add the URL to grasp"
                  height="40px"
                  value={urlValue}
                  onChange={setUrlValue}
                  showControls={false}
                />
                <TextArea
                  placeholder="Add your HTML block here"
                  value={htmlValue}
                  onChange={setHtmlValue}
                  onPaste={handleHTMLPaste}
                  language="html"
                />
                <ButtonRow buttons={buttons} />
                <TextArea
                  placeholder="Add your CSS block here"
                  value={cssValue}
                  onChange={setCssValue}
                  onPaste={handleCSSPaste}
                  language="css"
                />
                <div className="flex gap-4">
                  <div className="flex-1">
                    <TextArea
                      placeholder="ComponentName"
                      height="40px"
                      value={componentName}
                      onChange={setComponentName}
                      showControls={false}
                    />
                  </div>
                  <div className="flex-1">
                    <TextArea
                      placeholder="component_directory"
                      height="40px"
                      value={componentDirectory}
                      onChange={setComponentDirectory}
                      showControls={false}
                    />
                  </div>
                  <div className="flex-1">
                    <TextArea
                      placeholder="PageName"
                      height="40px"
                      value={pageName}
                      onChange={setPageName}
                      showControls={false}
                    />
                  </div>
                </div>
                <div className="button-row-container">
                  <div className="button-row-buttons">
                    <ButtonLight
                      text="Nether Grasp"
                      onClick={handleNetherGrasp}
                      icon={
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ overflow: "visible" }}
                        >
                          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path
                            d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
                            style={{
                              transform: "none",
                              transformOrigin: "50% 50%",
                              transformBox: "fill-box",
                            }}
                          ></path>
                        </svg>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
