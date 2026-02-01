"use client";

import "./_css/TasksList.css";

interface Task {
  id?: number;
  ComponentName: string;
  component_directory: string;
  PageName: string;
  date_created: string;
  status: "Pending" | "Running" | "Deploying" | "Completed" | "Error";
  date_completed: string | null;
  agent_id: string | null;
  agent_status: string | null;
  agent_url: string | null;
  branch_name: string | null;
}

interface TasksListProps {
  tasks: Task[];
  onRefresh: () => void;
}

export default function TasksList({ tasks, onRefresh }: TasksListProps) {
  if (tasks.length === 0) {
    return null;
  }

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "Completed":
        return "text-green-400";
      case "Running":
        return "text-blue-400";
      case "Deploying":
        return "text-purple-400";
      case "Error":
        return "text-red-400";
      default:
        return "text-yellow-400";
    }
  };

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "Completed":
        return "✅";
      case "Running":
        return "⚙️";
      case "Deploying":
        return "🚀";
      case "Error":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getAgentStatusBadge = (agentStatus: string | null) => {
    if (!agentStatus) return null;

    const colors: Record<string, string> = {
      CREATING: "bg-purple-500/20 text-purple-300",
      RUNNING: "bg-blue-500/20 text-blue-300",
      FINISHED: "bg-green-500/20 text-green-300",
      ERROR: "bg-red-500/20 text-red-300",
      EXPIRED: "bg-gray-500/20 text-gray-300",
    };

    return (
      <span
        className={`rounded-full px-2 py-1 text-xs ${colors[agentStatus] ?? "bg-gray-500/20 text-gray-300"}`}
      >
        {agentStatus}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const runningCount = tasks.filter((t) => t.status === "Running").length;
  const deployingCount = tasks.filter((t) => t.status === "Deploying").length;
  const completedCount = tasks.filter((t) => t.status === "Completed").length;
  const errorCount = tasks.filter((t) => t.status === "Error").length;

  return (
    <div className="tasks-list-container">
      <div className="tasks-list-header">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Tasks</h2>
          <button
            onClick={onRefresh}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            title="Refresh tasks"
          >
            🔄 Refresh
          </button>
        </div>
        <div className="tasks-summary">
          <span className="text-sm text-gray-400">
            Total: {tasks.length} | Running: {runningCount} | Deploying:{" "}
            {deployingCount} | Completed: {completedCount} | Errors:{" "}
            {errorCount}
          </span>
        </div>
      </div>

      <div className="tasks-list">
        {tasks.map((task) => (
          <div key={task.id ?? task.agent_id ?? task.ComponentName} className="task-item">
            <div className="task-item-header">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getStatusIcon(task.status)}</span>
                <span
                  className={`font-semibold ${getStatusColor(task.status)}`}
                >
                  {task.ComponentName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getAgentStatusBadge(task.agent_status)}
                <span className={`text-sm ${getStatusColor(task.status)}`}>
                  {task.status}
                </span>
              </div>
            </div>

            <div className="task-item-details">
              <div className="task-detail-row">
                <span className="text-gray-500">Directory:</span>
                <span className="text-gray-300">
                  {task.component_directory}
                </span>
              </div>
              <div className="task-detail-row">
                <span className="text-gray-500">Page:</span>
                <span className="text-gray-300">{task.PageName}</span>
              </div>
              <div className="task-detail-row">
                <span className="text-gray-500">Created:</span>
                <span className="text-xs text-gray-400">
                  {formatDate(task.date_created)}
                </span>
              </div>
              {task.date_completed && (
                <div className="task-detail-row">
                  <span className="text-gray-500">Completed:</span>
                  <span className="text-xs text-gray-400">
                    {formatDate(task.date_completed)}
                  </span>
                </div>
              )}
              {task.agent_id && (
                <div className="task-detail-row">
                  <span className="text-gray-500">Agent ID:</span>
                  <span className="font-mono text-xs text-gray-400">
                    {task.agent_id}
                  </span>
                </div>
              )}
              {task.branch_name && (
                <div className="task-detail-row">
                  <span className="text-gray-500">Branch:</span>
                  <span className="text-xs text-gray-400">
                    {task.branch_name}
                  </span>
                </div>
              )}
              {task.agent_url && (
                <div className="task-detail-row">
                  <span className="text-gray-500">URL:</span>
                  <a
                    href={task.agent_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    View Agent →
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
