"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./_css/TaskModal.css";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  agentUrl?: string | null;
  _agentId?: string;
  onDelete?: () => void;
}

export default function TaskModal({
  isOpen,
  onClose,
  position,
  agentUrl,
  _agentId,
  onDelete,
}: TaskModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !isMounted.current ||
        !modalRef.current ||
        modalRef.current.contains(event.target as Node)
      ) {
        return;
      }
      onClose();
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  const handleCopyRequestURL = async () => {
    console.log("COPY URL CLICKED", agentUrl);
    if (agentUrl) {
      try {
        await navigator.clipboard.writeText(agentUrl);
        console.log("URL COPIED");
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
    onClose();
  };

  const handleDeleteAgent = () => {
    console.log("DELETE CLICKED");
    // Close modal first to allow cleanup before component unmounts
    onClose();
    // Then trigger delete after a brief delay to ensure modal cleanup completes
    if (onDelete) {
      setTimeout(() => {
        onDelete();
      }, 50);
    }
  };

  if (!isOpen) return null;

  console.log("MODAL RENDERING", position, agentUrl);

  // Ensure we're in browser environment (Next.js SSR compatibility)
  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div
      ref={modalRef}
      className="task-modal-container"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="task-modal-content">
        <button
          className="task-modal-button"
          onClick={handleCopyRequestURL}
          disabled={!agentUrl}
        >
          <div className="task-modal-button-inner">
            <span className="task-modal-icon">
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
                className="lucide lucide-copy size-3"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
              </svg>
            </span>
            <span className="task-modal-button-text">Copy request URL</span>
          </div>
        </button>
        <button
          className="task-modal-button task-modal-button-delete"
          onClick={handleDeleteAgent}
        >
          <div className="task-modal-button-inner">
            <span className="task-modal-icon task-modal-icon-delete">
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
                className="lucide lucide-trash2 size-3"
              >
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                <line x1="10" x2="10" y1="11" y2="17"></line>
                <line x1="14" x2="14" y1="11" y2="17"></line>
              </svg>
            </span>
            <span className="task-modal-button-text task-modal-text-delete">
              Delete agent
            </span>
          </div>
        </button>
      </div>
    </div>
  );

  // Render modal as a Portal at document.body level to prevent lifecycle issues
  return createPortal(modalContent, document.body);
}
