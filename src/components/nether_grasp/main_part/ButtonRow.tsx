import "./_css/ButtonRow.css";
import ButtonDark from "~/components/nether_grasp/main_part/ButtonDark";

interface ButtonConfig {
  text: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

interface ButtonRowProps {
  buttons: ButtonConfig[];
}

export default function ButtonRow({ buttons }: ButtonRowProps) {
  return (
    <div className="button-row-container">
      <div className="button-row-buttons">
        {buttons.map((button, index) => (
          <ButtonDark
            key={index}
            text={button.text}
            icon={button.icon}
            onClick={button.onClick}
            animationDelay={index * 100}
          />
        ))}
      </div>
    </div>
  );
}
