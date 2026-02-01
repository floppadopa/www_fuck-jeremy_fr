"use client";

import "./_css/PromptDisplay.css";

interface PromptDisplayProps {
  prompt: string;
  onClose: () => void;
}

export default function PromptDisplay({ prompt, onClose }: PromptDisplayProps) {
  const copyAndSend = async () => {
    await navigator.clipboard.writeText(prompt);
    onClose();
    alert("✅ Prompt copied to clipboard!\n\n🎯 Now:\n1. Open Cursor Composer (Cmd/Ctrl + L)\n2. Paste (Cmd/Ctrl + V)\n3. Send the prompt");
  };

  return (
    <div className="prompt-overlay" onClick={onClose}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-header">
          <h3 className="prompt-title">✅ Task Created - Send to Cursor</h3>
          <button onClick={onClose} className="prompt-close-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
        <div className="prompt-content">
          <p className="prompt-instruction">📋 This prompt has been copied to your clipboard:</p>
          <pre className="prompt-text">{prompt}</pre>
          <p className="prompt-instruction" style={{ marginTop: '1rem', color: '#4ade80' }}>
            🎯 Next steps:<br/>
            1. Open Cursor Composer (Cmd/Ctrl + L or click Composer button)<br/>
            2. Paste (Cmd/Ctrl + V)<br/>
            3. Send the prompt
          </p>
        </div>
        <div className="prompt-actions">
          <button onClick={copyAndSend} className="prompt-btn prompt-btn-primary">
            ✅ Copy & Close
          </button>
        </div>
      </div>
    </div>
  );
}

