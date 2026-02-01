"use client";

import { useState } from 'react';
import './_css/Navbar.css';
import TopPart from '~/components/nether_grasp/navbar/TopPart';
import TaskList from '~/components/nether_grasp/navbar/TaskList';

interface NavbarProps {
  isVisible: boolean;
  onToggle: () => void;
}

export default function Navbar({ isVisible, onToggle }: NavbarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isVisible) {
    return null;
  }

  return (
    <div 
      tabIndex={0} 
      role="listbox" 
      className="navbar-container relative z-[1] flex flex-none flex-col border-r border-theme-border-02 outline-none focus:outline-none transition-all duration-150 ease-in-out" 
      style={{ width: '240px' }}
    >
      <div 
        className="absolute bottom-0 top-0 flex cursor-col-resize items-center justify-center" 
        style={{ right: '-12px', width: '24px', zIndex: 50 }}
      >
        <div className="border-theme-border-02 hover:border-theme-border-02-hover h-full w-0.5 transition-colors" />
      </div>
      <div className="flex h-full flex-col">
        <TopPart searchQuery={searchQuery} onSearchChange={setSearchQuery} onToggleNavbar={onToggle} />
        <TaskList searchQuery={searchQuery} />
      </div>
    </div>
  );
}

