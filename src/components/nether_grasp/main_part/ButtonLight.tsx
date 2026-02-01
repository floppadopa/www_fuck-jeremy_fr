import "./_css/ButtonLight.css";

interface ButtonLightProps {
  text: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export default function ButtonLight({ text, icon, onClick }: ButtonLightProps) {
  return (
    <button onClick={onClick} className="group flex h-[32px] w-full gap-1 btn outline-none transition-colors duration-200 focus:outline-none">
      <div className="inline-flex select-none items-center justify-center text-current" aria-hidden="true">
        {icon}
      </div>
      <span>{text}</span>
    </button>
  );
}

