import "./_css/TopPart.css";
import SearchBar from "~/components/nether_grasp/navbar/SearchBar";
import ToggleNavbar from "~/components/nether_grasp/navbar/ToggleNavbar";
import Image from "next/image";

interface TopPartProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onToggleNavbar: () => void;
}

export default function TopPart({
  searchQuery,
  onSearchChange,
  onToggleNavbar,
}: TopPartProps) {
  return (
    <div className="px-2 pt-2 pb-0">
      <div className="mb-[14px] flex items-center justify-between pl-2">
        <a
          className="focus-visible:focus-visible inline-flex"
          aria-label="Homepage"
          href="https://cursor.com/home?from=agents"
        >
          <div className="relative top-[2px]">
            <Image
              src="/nether-grasp-logo.png"
              alt="Nether Grasp Logo"
              width={22}
              height={22}
              style={{ filter: "invert(1)" }}
            />
          </div>
          <span className="sr-only"></span>
        </a>
        <ToggleNavbar onToggle={onToggleNavbar} />
      </div>
      <SearchBar value={searchQuery} onChange={onSearchChange} />
    </div>
  );
}
