"use client";

import { useState, useEffect } from "react";
import "./_css/Task.css";
import TaskOption from "~/components/nether_grasp/navbar/TaskOption";
import TaskModal from "~/components/nether_grasp/navbar/TaskModal";

interface TaskProps {
  ComponentName: string;
  component_directory: string;
  PageName: string;
  status:
    | "Queued"
    | "Pending"
    | "Running"
    | "Deploying"
    | "Completed"
    | "Error";
  date_created: string;
  agent_url?: string | null;
  agent_status?: string | null;
  agent_id?: string;
  onStatusChange?: (newStatus: "Pending" | "Completed") => void;
  onDelete?: () => void;
}

export default function Task({
  ComponentName,
  component_directory,
  PageName,
  status,
  date_created,
  agent_url,
  agent_status: _agent_status,
  agent_id,
  onStatusChange,
  onDelete,
}: TaskProps) {
  const [isDone, setIsDone] = useState(status === "Completed");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });

  // Update isDone when status prop changes
  useEffect(() => {
    setIsDone(status === "Completed");
  }, [status]);

  const handleClick = async () => {
    console.log("TASK CLICKED", ComponentName, agent_url);
    // If there's an agent URL, redirect to it
    if (agent_url) {
      console.log("Opening URL", agent_url);
      window.open(agent_url, "_blank");
      return;
    }

    // Otherwise, toggle status manually
    const newStatus = !isDone;
    setIsDone(newStatus);

    if (onStatusChange) {
      onStatusChange(newStatus ? "Completed" : "Pending");
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleTaskOptionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log("3 DOTS CLICKED", ComponentName);
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const newPosition = {
      top: rect.bottom + 4,
      left: rect.left,
    };
    console.log("Setting modal open", newPosition);
    setModalPosition(newPosition);
    setIsModalOpen(true);
  };

  return (
    <>
      {isModalOpen && (
        <TaskModal
          key={`modal-${agent_id ?? ComponentName}`}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          position={modalPosition}
          agentUrl={agent_url}
          _agentId={agent_id}
          onDelete={onDelete}
        />
      )}
      <div
        className="group web-text-base hover:bg-theme-card-hover-hex hover:text-theme-text relative cursor-pointer rounded-md px-[8px] py-[6px]"
        style={{ border: "1px solid transparent", color: "rgb(123, 136, 161)" }}
        onClick={handleClick}
      >
        <TaskOption onClick={handleTaskOptionClick} />
        <div className="flex min-w-0 items-center gap-1">
          <div className="text-theme-text-sec flex items-center justify-center pr-[4px]">
            {status === "Queued" || status === "Pending" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[14px] w-[14px] text-yellow-500"
              >
                <line x1="6" x2="6" y1="3" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            ) : status === "Error" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[14px] w-[14px] text-red-500"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            ) : isDone ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-[14px] w-[14px] text-green-500"
              >
                <path
                  d="M12.9802 3.64648C13.1754 3.45139 13.492 3.45128 13.6872 3.64648C13.8822 3.84171 13.8822 4.15829 13.6872 4.35352L6.3532 11.6865C6.15794 11.8818 5.84143 11.8818 5.64617 11.6865L2.31316 8.35352C2.1179 8.15825 2.1179 7.84175 2.31316 7.64648C2.50843 7.45122 2.82493 7.45122 3.0202 7.64648L5.99969 10.626L12.9802 3.64648Z"
                  fill="currentColor"
                ></path>
              </svg>
            ) : status === "Deploying" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[14px] w-[14px] animate-pulse text-blue-500"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-loader-pulse h-[14px] w-[14px]"
                aria-hidden="true"
              >
                <path d="M12 2v4"></path>
                <path d="m16.2 7.8 2.9-2.9"></path>
                <path d="M18 12h4"></path>
                <path d="m16.2 16.2 2.9 2.9"></path>
                <path d="M12 18v4"></path>
                <path d="m4.9 19.1 2.9-2.9"></path>
                <path d="M2 12h4"></path>
                <path d="m4.9 4.9 2.9 2.9"></path>
              </svg>
            )}
          </div>
          <div
            className="text-theme-text min-w-0 flex-1 truncate text-[13px]"
            style={{ lineHeight: "140%", letterSpacing: "0px" }}
          >
            {ComponentName}
          </div>
          <div className="text-theme-text-sec flex h-[16px] shrink-0 items-center gap-1 text-xs">
            <span>{getTimeAgo(date_created)}</span>
          </div>
        </div>
        <div
          className="text-theme-text-sec flex items-center gap-1 pl-[22px] text-xs whitespace-nowrap"
          style={{ lineHeight: "150%", letterSpacing: "0.07px" }}
        >
          <span className="truncate">{component_directory}</span>
          <span>·</span>
          <span className="truncate">{PageName}</span>
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[80px] rounded-[6px] opacity-0 group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(to left, var(--color-theme-bg-card) 40%, rgba(255,255,255,0))",
          }}
        ></div>
      </div>
    </>
  );
}
