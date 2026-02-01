"use client";

import "./_css/SyntaxHighlight.css";

interface SyntaxHighlightProps {
  code: string;
  language: "html" | "css";
}

export default function SyntaxHighlight({ code, language }: SyntaxHighlightProps) {
  const highlightHTML = (html: string) => {
    if (!html) return "";
    
    let result = html;
    
    // HTML comments
    result = result.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
    
    // Match full HTML tags with attributes
    result = result.replace(/(&lt;\/?)(\w+)((?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'))?)*\s*)(&gt;)/g, 
      (match: string, opening: string, tagName: string, attrs: string, closing: string) => {
        let highlighted = `<span class="tag">${opening}</span><span class="tag-name">${tagName}</span>`;
        
        if (attrs.trim()) {
          // Highlight attributes
          const attrHighlighted = attrs.replace(/([\w-]+)(=)("([^"]*)"|'([^']*)')/g, 
            '<span class="attr-name">$1</span><span class="punctuation">$2</span><span class="attr-value">$3</span>');
          highlighted += attrHighlighted;
        }
        
        highlighted += `<span class="tag">${closing}</span>`;
        return highlighted;
      }
    );
    
    return result;
  };

  const highlightCSS = (css: string) => {
    if (!css) return "";
    
    return css
      // CSS comments
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
      // CSS selectors
      .replace(/^([.#]?[\w-]+(?:\s*[>+~]\s*)?[\w-]*)/gm, '<span class="selector">$1</span>')
      // CSS properties
      .replace(/([\w-]+)(\s*:)/g, '<span class="property">$1</span><span class="punctuation">$2</span>')
      // CSS values
      .replace(/:\s*([^;{}\n]+)/g, ': <span class="value">$1</span>')
      // CSS units
      .replace(/(\d+)(px|em|rem|%|vh|vw|deg)/g, '<span class="number">$1</span><span class="unit">$2</span>')
      // Brackets and semicolons
      .replace(/([{}();])/g, '<span class="punctuation">$1</span>');
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const getHighlightedCode = () => {
    const escaped = escapeHtml(code);
    if (language === "html") {
      return highlightHTML(escaped);
    } else if (language === "css") {
      return highlightCSS(escaped);
    }
    return escaped;
  };

  return (
    <div 
      className="syntax-highlight"
      dangerouslySetInnerHTML={{ __html: getHighlightedCode() }}
    />
  );
}

