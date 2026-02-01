"use client";

import { useRef, useEffect, useState } from "react";
import "./_css/TextArea.css";
import SyntaxHighlight from "./SyntaxHighlight";

interface TextAreaProps {
  placeholder?: string;
  height?: string;
  value?: string;
  onChange?: (value: string) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  language?: "html" | "css" | "none";
  showControls?: boolean;
}

export default function TextArea({
  placeholder = "Ask Cursor to build, fix bugs, explore",
  height = "64px",
  value = "",
  onChange,
  onPaste,
  language = "none",
  showControls = true,
}: TextAreaProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync editable content with value prop when it changes externally
  useEffect(() => {
    if (editableRef.current && document.activeElement !== editableRef.current) {
      // Only update if the user is not actively typing in this field
      const currentText = editableRef.current.textContent || "";
      if (currentText !== value) {
        // Store cursor position
        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const cursorOffset = range ? range.startOffset : 0;
        
        editableRef.current.textContent = value;
        
        // Restore cursor position if this element still has focus
        if (document.activeElement === editableRef.current && value) {
          try {
            const newRange = document.createRange();
            const textNode = editableRef.current.firstChild;
            if (textNode) {
              newRange.setStart(textNode, Math.min(cursorOffset, value.length));
              newRange.collapse(true);
              selection?.removeAllRanges();
              selection?.addRange(newRange);
            }
          } catch (e) {
            // Ignore cursor restoration errors
          }
        }
      }
    }
  }, [value]);

  // Handle drag and drop for HTML files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    // Accept different file types based on the language prop
    let targetFile: File | undefined;
    if (language === "html") {
      targetFile = files.find((file) => file.name.endsWith(".html"));
    } else if (language === "css") {
      targetFile = files.find((file) => file.name.endsWith(".css"));
    }

    if (targetFile) {
      try {
        const content = await targetFile.text();
        onChange?.(content);
        // Also update the editable div directly
        if (editableRef.current) {
          editableRef.current.textContent = content;
        }
      } catch (error) {
        console.error(`Error reading ${language} file:`, error);
      }
    }
  };

  return (
    <div 
      className="textarea-container border-theme-border-02 flex w-full cursor-text flex-col overflow-hidden rounded-xl border bg-[var(--color-theme-bg-card-02)] shadow-sm"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : undefined,
        borderColor: isDragging ? '#3b82f6' : undefined,
        transition: 'background-color 0.2s, border-color 0.2s',
      }}
    >
      <div className="px-0">
        <form className="relative flex flex-col">
          <div
            className="relative max-h-[200px] overflow-y-auto"
            style={{ minHeight: height }}
          >
            <div
              ref={editableRef}
              className="text-theme-text web-text-base w-full resize-none bg-transparent px-3 py-3 outline-none"
              contentEditable={true}
              role="textbox"
              spellCheck={true}
              data-lexical-editor="true"
              onInput={(e) => onChange?.(e.currentTarget.textContent || "")}
              onPaste={onPaste}
              suppressContentEditableWarning
              dir="ltr"
              style={{
                userSelect: "text",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                minHeight: height,
                position: "relative",
                zIndex: 1,
                color: language !== "none" ? "transparent" : "#ffffff",
                caretColor: "#ffffff",
                WebkitTextFillColor:
                  language !== "none" ? "transparent" : "#ffffff",
                direction: "ltr",
                textAlign: "left",
              }}
            />
            {language !== "none" && value && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <SyntaxHighlight code={value} language={language} />
              </div>
            )}
            {!value && (
              <div
                className="web-text-base text-theme-text-sec pointer-events-none absolute top-[12px] left-3 opacity-100"
                style={{ zIndex: 3 }}
              >
                {placeholder}
              </div>
            )}
          </div>
          {showControls && (
            <div className="pb-2">
              <div className="flex min-h-[28px] items-center gap-1 px-2 pl-3">
                <div className="flex-1"></div>
              </div>
              <input type="file" accept="image/*" multiple className="hidden" />
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
