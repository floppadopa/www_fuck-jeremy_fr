import "./_css/ToggleOpenNavbar.css";

interface ToggleOpenNavbarProps {
  onToggle: () => void;
}

export default function ToggleOpenNavbar({ onToggle }: ToggleOpenNavbarProps) {
  return (
    <div className="toggle-open-navbar-container flex items-center gap-2 z-[60] ml-2">
      <button
        type="button"
        aria-label="Toggle left sidebar"
        aria-pressed="false"
        data-tooltip-id="open-left-sidebar"
        data-tooltip-content="Open left sidebar"
        data-tooltip-place="bottom-start"
        className="text-theme-text-sec flex cursor-pointer items-center gap-2 rounded-[6px] p-1 outline-none transition-opacity hover:opacity-100 focus:outline-none"
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
            className="lucide lucide-panel-left-open size-4"
          >
            <rect width="18" height="18" x="3" y="3" rx="2"></rect>
            <path d="M9 3v18"></path>
            <path d="m14 9 3 3-3 3"></path>
          </svg>
        </span>
      </button>
    </div>
  );
}

