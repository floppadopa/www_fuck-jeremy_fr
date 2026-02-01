import './_css/BottomToolBar.css';

export default function BottomToolBar() {
  return (
    <div className="flex-shrink-0 p-2">
      <div className="flex items-center justify-between relative">
        <div className="relative">
          <button className="flex items-center rounded-md border border-[var(--color-theme-border-secondary)] px-1.5 py-[3px] web-text-sm gap-1 ease whitespace-nowrap transition duration-150 text-[var(--color-theme-text)] hover:bg-white/[0.04] !border-0 !bg-transparent !p-0">
            <span 
              data-tooltip-id="settings-button" 
              data-tooltip-content="Settings" 
              data-tooltip-place="bottom-end" 
              className="rounded-[6px] p-1 text-theme-text-sec opacity-75 p-2 hover:opacity-100"
            >
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
                className="lucide lucide-settings h-4 w-4"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
          </button>
        </div>
        <div className="relative">
          <button className="flex items-center rounded-md border border-[var(--color-theme-border-secondary)] px-1.5 py-[3px] web-text-sm gap-1 ease whitespace-nowrap transition duration-150 text-[var(--color-theme-text)] hover:bg-white/[0.04] !border-0 !bg-transparent !p-0">
            <span 
              data-tooltip-id="help-menu" 
              data-tooltip-content="Help" 
              data-tooltip-place="bottom-end" 
              className="rounded-[6px] p-1 text-theme-text-sec opacity-75 p-2 hover:opacity-100"
            >
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
                className="lucide lucide-circle-help h-4 w-4"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

