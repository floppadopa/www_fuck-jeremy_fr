"use client";

interface TaskOptionProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export default function TaskOption({ onClick }: TaskOptionProps) {
  return (
    <button
      data-item-menu="true"
      className="text-theme-text hover:text-theme-text !absolute !top-1 !right-1 !z-[100] rounded-md p-1 opacity-0 outline-none group-hover:!opacity-100 hover:bg-white/5 focus:outline-none transition-opacity"
      aria-haspopup="menu"
      aria-expanded="false"
      onClick={(e) => {
        console.log("TaskOption button clicked!");
        onClick?.(e);
      }}
      style={{ pointerEvents: 'auto' }}
    >
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
        className="lucide lucide-ellipsis"
      >
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="19" cy="12" r="1"></circle>
        <circle cx="5" cy="12" r="1"></circle>
      </svg>
    </button>
  );
}

