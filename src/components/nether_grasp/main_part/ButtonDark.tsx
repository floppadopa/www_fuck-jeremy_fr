import "./_css/ButtonDark.css";

interface ButtonDarkProps {
  text: string;
  icon: React.ReactNode;
  animationDelay?: number;
  onClick?: () => void;
}

export default function ButtonDark({ text, icon, animationDelay = 0, onClick }: ButtonDarkProps) {
  return (
    <button
      onClick={onClick}
      className="button-dark group flex items-center gap-2 rounded-full border px-3 py-2 web-text-base transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 [animation-fill-mode:forwards]"
      style={{ animationDelay: `${animationDelay}ms`, animationDuration: "400ms" }}
    >
      <span className="text-theme-text-sec transition-colors group-hover:text-theme-text fill-theme-text fill-theme-text-sec">
        <div>
          {icon}
        </div>
      </span>
      <span>{text}</span>
    </button>
  );
}

