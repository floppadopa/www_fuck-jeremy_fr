import './_css/TaskDay.css';

interface TaskDayProps {
  label: string;
}

export default function TaskDay({ label }: TaskDayProps) {
  return (
    <div className="task-day-container">
      <span>{label}</span>
      <div className="task-day-icon-wrapper">
        <div className="task-day-icon-inner">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="10" 
            height="10" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

