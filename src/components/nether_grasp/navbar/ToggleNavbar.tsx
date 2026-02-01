import "./_css/ToggleNavbar.css";

interface ToggleNavbarProps {
  onToggle: () => void;
}

export default function ToggleNavbar({ onToggle }: ToggleNavbarProps) {
  return (
    <button
      type="button"
      aria-label="Toggle left sidebar"
      aria-pressed="true"
      data-tooltip-id="toggle-left-sidebar"
      data-tooltip-content="Toggle left sidebar"
      data-tooltip-place="bottom-start"
      className="text-theme-text-sec flex cursor-pointer items-center gap-2 rounded-[6px] p-1 transition-opacity outline-none hover:bg-white/5 hover:opacity-100 focus:outline-none"
      onClick={onToggle}
    >
      <span className="relative inline-flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-panel-left-close size-4"
        >
          <rect width="18" height="18" x="3" y="3" rx="2"></rect>
          <path d="M9 3v18"></path>
          <path d="m16 15-3-3 3-3"></path>
        </svg>
      </span>
    </button>
  );
}






