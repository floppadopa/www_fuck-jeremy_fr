"use client";

import { useEffect, useState } from "react";
import TaskDay from "~/components/nether_grasp/navbar/TaskDay";
import Task from "~/components/nether_grasp/navbar/Task";
import "./_css/TaskList.css";

interface TaskData {
  id?: number;
  ComponentName: string;
  component_directory: string;
  PageName: string;
  date_created: string;
  status: "Queued" | "Pending" | "Running" | "Deploying" | "Completed" | "Error";
  date_completed: string | null;
  agent_id?: string | null;
  agent_status?: string | null;
  agent_url?: string | null;
}

type GroupedTasks = Record<string, TaskData[]>;

interface TaskListProps {
  searchQuery: string;
}

export default function TaskList({ searchQuery }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchTasks();

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      void fetchTasks();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/nether-grasp/tasks");
      const data = (await response.json()) as { tasks: TaskData[] };
      setTasks(data.tasks || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (
    ComponentName: string,
    newStatus: "Pending" | "Completed",
  ) => {
    try {
      await fetch("/api/nether-grasp/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ComponentName,
          status: newStatus,
        }),
      });

      // Refresh tasks after update
      await fetchTasks();
    } catch (error) {
      console.error("Error updating task status:", error);
    }
  };

  const handleDeleteTask = async (agent_id?: string, ComponentName?: string) => {
    try {
      await fetch("/api/nether-grasp/tasks", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id,
          ComponentName,
        }),
      });

      // Refresh tasks after deletion
      await fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const groupTasksByDate = (
    tasks: TaskData[],
  ): { grouped: GroupedTasks; sortedLabels: string[] } => {
    // First, sort all tasks by date_created descending (newest first)
    const sortedTasks = [...tasks].sort(
      (a, b) =>
        new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
    );

    const grouped: GroupedTasks = {};
    const labelOrder: { label: string; date: Date }[] = [];

    sortedTasks.forEach((task) => {
      const date = new Date(task.date_created);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let label: string;
      if (date.toDateString() === today.toDateString()) {
        label = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        label = "Yesterday";
      } else {
        label = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }

      if (!grouped[label]) {
        grouped[label] = [];
        labelOrder.push({ label, date });
      }
      const group = grouped[label];
      if (group) {
        group.push(task);
      }
    });

    // Sort labels: Today, Yesterday, then older dates in descending order
    const sortedLabels = labelOrder.map((item) => item.label);

    return { grouped, sortedLabels };
  };

  // Filter tasks by search query using regex
  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery.trim()) return true;

    try {
      const regex = new RegExp(searchQuery, "i"); // case-insensitive
      return regex.test(task.ComponentName);
    } catch {
      // If regex is invalid, fall back to simple includes
      return task.ComponentName.toLowerCase().includes(
        searchQuery.toLowerCase(),
      );
    }
  });

  const { grouped: groupedTasks, sortedLabels: dateLabels } =
    groupTasksByDate(filteredTasks);

  if (loading) {
    return (
      <div className="task-list-container flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-2">
          <div className="text-theme-text-sec p-2 text-sm">
            Loading tasks...
          </div>
        </div>
      </div>
    );
  }

  if (dateLabels.length === 0) {
    return (
      <div className="task-list-container flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-2">
          <div className="text-theme-text-sec p-2 text-sm">
            {searchQuery ? "No tasks match your search" : "No tasks yet"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-list-container flex-1 overflow-y-auto">
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-col gap-0.5">
          {dateLabels.map((dateLabel) => {
            const tasksForDate = groupedTasks[dateLabel];
            if (!tasksForDate) return null;
            
            return (
              <div key={dateLabel}>
                <TaskDay label={dateLabel} />
                {tasksForDate.map((task) => (
                  <Task
                    key={task.id ? `id-${task.id}` : `name-${task.ComponentName}-${task.date_created}`}
                    ComponentName={task.ComponentName}
                    component_directory={task.component_directory}
                    PageName={task.PageName}
                    status={task.status}
                    date_created={task.date_created}
                    agent_url={task.agent_url}
                    agent_status={task.agent_status}
                    agent_id={task.agent_id ?? undefined}
                    onStatusChange={(newStatus) =>
                      handleStatusChange(task.ComponentName, newStatus)
                    }
                    onDelete={() =>
                      handleDeleteTask(task.agent_id ?? undefined, task.ComponentName)
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
