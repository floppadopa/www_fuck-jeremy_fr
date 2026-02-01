"use client";

import { useState, useRef } from "react";
import "./_css/SearchBar.css";
import SearchBarFilterButton from "~/components/nether_grasp/navbar/SearchBarFilterButton";
import SearchBarModal from "~/components/nether_grasp/navbar/SearchBarModal";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleFilterClick = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setModalPosition({
        top: rect.bottom + 5,
        left: rect.left,
      });
    }
    setIsModalOpen(!isModalOpen);
  };

  return (
    <>
      <div className="relative mb-3">
        <input
          placeholder="Search tasks..."
          className="border-theme-border-02 web-text-base text-theme-text h-[32px] w-full rounded-md border bg-transparent px-[8px] py-[3px] pr-16 transition-colors placeholder:text-(--color-theme-text-sec) placeholder:opacity-100 focus:outline-none"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="absolute top-1/2 right-1 z-99 flex -translate-y-1/2 transform items-center gap-0.5">
          <div className="relative" ref={buttonRef}>
            <SearchBarFilterButton onClick={handleFilterClick} />
          </div>
        </div>
      </div>
      <SearchBarModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        position={modalPosition}
      />
    </>
  );
}
