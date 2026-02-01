import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { db } from "~/server/db";

const execAsync = promisify(exec);

interface SaveFilesRequest {
  componentName: string;
  html: string;
  css: string;
}

export async function POST(request: NextRequest) {
  try {
    // This endpoint only works locally, not on Vercel (read-only filesystem)
    const isVercel = process.env.VERCEL === "1";
    
    if (isVercel) {
      return NextResponse.json(
        { 
          error: "This endpoint only works locally", 
          message: "File operations and git commands require a local development environment. Please run this from your local machine." 
        },
        { status: 501 } // 501 = Not Implemented
      );
    }

    const { componentName, html, css } = await request.json() as SaveFilesRequest;

    if (!componentName || !html || !css) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create directory path
    const projectRoot = process.cwd();
    const netherGraspDir = path.join(projectRoot, "nether-grasp");
    const targetDir = path.join(netherGraspDir, componentName);

    // Create directories if they don't exist
    await mkdir(netherGraspDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });

    // Write HTML file
    const htmlPath = path.join(targetDir, "nether-grasp-component.html");
    await writeFile(htmlPath, html, "utf-8");

    // Write CSS file
    const cssPath = path.join(targetDir, "nether-grasp-styles.css");
    await writeFile(cssPath, css, "utf-8");

    // Check if another task is currently running
    // If yes, skip git operations (will be handled by bridge server when task is dequeued)
    const activeTasks = await db.task.findMany({
      where: {
        status: {
          in: ["Pending", "Running", "Deploying"],
        },
      },
    });

    const hasActiveTasks = activeTasks.length > 0;
    const stagingBranch = "nether-grasp-staging";

    if (hasActiveTasks) {
      console.log("⏸️  Active task detected - skipping git operations (will be handled by queue)");
      console.log(`   Active tasks: ${activeTasks.map((t) => t.componentName).join(", ")}`);
      
      return NextResponse.json({
        success: true,
        htmlPath: `nether-grasp/${componentName}/nether-grasp-component.html`,
        cssPath: `nether-grasp/${componentName}/nether-grasp-styles.css`,
        stagingBranch: stagingBranch,
        queuedMode: true, // Indicate that git operations were skipped
        message: "Files saved locally. Git operations will be performed when task is processed from queue.",
      });
    }

    // No active tasks - proceed with git operations immediately
    console.log("✅ No active tasks - proceeding with git operations");
    let branchCreated = false;
    
    try {
      // Check if staging branch exists
      const { stdout: branchList } = await execAsync("git branch --list", { cwd: projectRoot });
      const branchExists = branchList.includes(stagingBranch);
      
      // Get current branch
      const { stdout: currentBranch } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: projectRoot });
      const originalBranch = currentBranch.trim();
      
      if (!branchExists) {
        // Create staging branch from main
        await execAsync(`git checkout -b ${stagingBranch}`, { cwd: projectRoot });
        branchCreated = true;
        console.log(`✅ Created staging branch: ${stagingBranch}`);
      } else {
        // Switch to staging branch
        await execAsync(`git checkout ${stagingBranch}`, { cwd: projectRoot });
        console.log(`✅ Switched to staging branch: ${stagingBranch}`);
      }
      
      // SYNC WITH MAIN: Pull latest changes from main into staging
      console.log(`🔄 Syncing ${stagingBranch} with latest main branch...`);
      try {
        // Fetch latest from origin
        await execAsync('git fetch origin main', { cwd: projectRoot });
        
        // Merge main into staging (fast-forward if possible)
        await execAsync('git merge origin/main --no-edit', { cwd: projectRoot });
        console.log(`✅ Staging branch synced with main`);
      } catch (syncError) {
        console.warn(`⚠️ Could not sync with main (might be first time):`, syncError);
        // Continue anyway - staging might be new or main doesn't exist yet
      }
      
      // Add the files (force add to override .gitignore)
      await execAsync(`git add -f "nether-grasp/${componentName}"`, { cwd: projectRoot });
      
      // Commit
      const commitMessage = `feat: Add ${componentName} component files for AI agent processing`;
      await execAsync(`git commit -m "${commitMessage}"`, { cwd: projectRoot });
      
      // Push to remote
      if (branchCreated) {
        await execAsync(`git push -u origin ${stagingBranch}`, { cwd: projectRoot });
      } else {
        await execAsync(`git push origin ${stagingBranch}`, { cwd: projectRoot });
      }
      
      console.log(`✅ Pushed files to ${stagingBranch} branch`);
      
      // Switch back to original branch
      await execAsync(`git checkout ${originalBranch}`, { cwd: projectRoot });
      console.log(`✅ Switched back to ${originalBranch}`);
      
    } catch (gitError) {
      console.error("⚠️ Git operations failed:", gitError);
      // Don't fail the whole request, files are still saved locally
    }

    return NextResponse.json({
      success: true,
      htmlPath: `nether-grasp/${componentName}/nether-grasp-component.html`,
      cssPath: `nether-grasp/${componentName}/nether-grasp-styles.css`,
      stagingBranch: stagingBranch,
    });
  } catch (error) {
    console.error("Error saving files:", error);
    return NextResponse.json(
      { error: "Failed to save files", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

