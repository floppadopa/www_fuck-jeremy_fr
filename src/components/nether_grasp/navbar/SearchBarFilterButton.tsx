interface SearchBarFilterButtonProps {
  onClick: () => void;
}

export default function SearchBarFilterButton({
  onClick,
}: SearchBarFilterButtonProps) {
  return (
    <button
      type="button"
      className="flex items-center rounded-md p-1 transition-all duration-200 outline-none hover:bg-white/5 focus:outline-none"
      onClick={onClick}
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
        className="lucide lucide-sliders-horizontal text-theme-text-sec h-3 w-3"
      >
        <line x1="21" x2="14" y1="4" y2="4"></line>
        <line x1="10" x2="3" y1="4" y2="4"></line>
        <line x1="21" x2="12" y1="12" y2="12"></line>
        <line x1="8" x2="3" y1="12" y2="12"></line>
        <line x1="21" x2="16" y1="20" y2="20"></line>
        <line x1="12" x2="3" y1="20" y2="20"></line>
        <line x1="14" x2="14" y1="2" y2="6"></line>
        <line x1="8" x2="8" y1="10" y2="14"></line>
        <line x1="16" x2="16" y1="18" y2="22"></line>
      </svg>
    </button>
  );
}

