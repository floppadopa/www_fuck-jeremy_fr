"use client";

import { useState } from "react";
import "./_css/page.css";
import Navbar from "~/components/nether_grasp/Navbar";
import MainPart from "~/components/nether_grasp/MainPart";
import ToggleOpenNavbar from "~/components/nether_grasp/navbar/ToggleOpenNavbar";

export default function NetherGraspPage() {
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);

  const toggleNavbar = () => {
    setIsNavbarVisible(!isNavbarVisible);
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="agents-page flex h-screen min-h-screen flex-col overflow-y-auto">
        <div className="flex h-full flex-col gap-4">
          <div className="relative flex h-screen w-full">
            {!isNavbarVisible && (
              <div className="absolute top-4 left-0 z-[60]">
                <ToggleOpenNavbar onToggle={toggleNavbar} />
              </div>
            )}
            <Navbar isVisible={isNavbarVisible} onToggle={toggleNavbar} />
            <MainPart isNavbarVisible={isNavbarVisible} />
          </div>
        </div>
      </div>
    </main>
  );
}
