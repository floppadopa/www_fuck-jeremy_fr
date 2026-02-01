"use client";

import { useEffect } from "react";

export default function FaviconInverter() {
  useEffect(() => {
    const invertFavicon = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        // Draw the image
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Invert colors (black <-> white)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          if (r !== undefined) data[i] = 255 - r;     // Red
          if (g !== undefined) data[i + 1] = 255 - g; // Green
          if (b !== undefined) data[i + 2] = 255 - b; // Blue
          // Alpha channel (data[i + 3]) stays the same
        }
        
        // Put inverted image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Convert to data URL and set as favicon
        const dataUrl = canvas.toDataURL("image/png");
        
        // Remove existing favicon links
        const existingLinks = document.querySelectorAll('link[rel="icon"]');
        existingLinks.forEach((link) => link.remove());
        
        // Create new favicon link
        const link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        link.href = dataUrl;
        document.head.appendChild(link);
      };
      
      img.onerror = () => {
        console.error("Failed to load favicon image");
      };
      
      img.src = "/nether-grasp-logo.png";
    };
    
    invertFavicon();
    
    // Cleanup function to restore default favicon when component unmounts
    return () => {
      const existingLinks = document.querySelectorAll('link[rel="icon"]');
      existingLinks.forEach((link) => link.remove());
      
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = "/favicon.ico";
      document.head.appendChild(link);
    };
  }, []);
  
  return null;
}





