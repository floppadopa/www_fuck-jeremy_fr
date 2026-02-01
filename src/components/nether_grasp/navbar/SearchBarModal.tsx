"use client";

import { useEffect, useRef } from "react";
import "./_css/SearchBarModal.css";

interface SearchBarModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function SearchBarModal({
  isOpen,
  onClose,
  position,
}: SearchBarModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="search-bar-modal fixed overflow-hidden rounded-lg bg-theme-card border border-theme-border-02 shadow-sm"
      style={{
        width: "230px",
        zIndex: 1000,
        top: `${position.top}px`,
        left: `${position.left}px`,
        transformOrigin: "left top",
      }}
    >
      <div className="p-0.5">
        {/* Group Section */}
        <div className="flex h-[36px] w-full flex-row items-center justify-between px-2">
          <div className="flex items-center gap-2">
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
              className="lucide lucide-layers h-3 w-3 text-theme-text-sec"
            >
              <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path>
              <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"></path>
              <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"></path>
            </svg>
            <span className="text-[12px] font-semibold text-theme-text-sec">
              Group
            </span>
          </div>
          <select className="w-[142px] rounded-[4px] border border-theme-border-02 bg-transparent px-[6px] py-[3px] text-[12px] text-theme-text transition-colors focus:outline-none focus:ring-0">
            <option value="">Date</option>
            <option value="status">Status</option>
            <option value="repo">Repo</option>
            <option value="model">Model</option>
            <option value="merge">Merge</option>
            <option value="prompt">Prompt</option>
          </select>
        </div>

        {/* Sort Section */}
        <div className="flex h-[36px] w-full flex-row items-center justify-between px-2">
          <div className="flex items-center gap-2">
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
              className="lucide lucide-arrow-up-down h-3 w-3 text-theme-text-sec"
            >
              <path d="m21 16-4 4-4-4"></path>
              <path d="M17 20V4"></path>
              <path d="m3 8 4-4 4 4"></path>
              <path d="M7 4v16"></path>
            </svg>
            <span className="text-[12px] font-semibold text-theme-text-sec">
              Sort
            </span>
          </div>
          <div className="flex items-center gap-1">
            <select className="w-[114px] rounded-[4px] border border-theme-border-02 bg-transparent px-[6px] py-[3px] text-[12px] text-theme-text transition-colors focus:outline-none focus:ring-0">
              <option value="date">Date</option>
              <option value="status">Status</option>
              <option value="name">Name</option>
              <option value="model">Model</option>
              <option value="repo">Repo</option>
              <option value="branch">Branch</option>
            </select>
            <button
              type="button"
              className="rounded-[4px] p-1 transition-all duration-200 hover:bg-white/5"
            >
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
                className="lucide lucide-arrow-down-wide-narrow h-4 w-4 text-theme-text-sec"
              >
                <path d="m3 16 4 4 4-4"></path>
                <path d="M7 20V4"></path>
                <path d="M11 4h10"></path>
                <path d="M11 8h7"></path>
                <path d="M11 12h4"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
