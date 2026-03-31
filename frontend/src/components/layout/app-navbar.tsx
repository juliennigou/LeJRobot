import { Menu, Music2, Radio, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AppView = "home" | "analysis" | "movements" | "robot";

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: "home", label: "Home" },
  { id: "analysis", label: "Audio Stats" },
  { id: "movements", label: "Movement Library" },
  { id: "robot", label: "Robot Dashboard" },
];

export function AppNavbar({
  activeView,
  onChange,
}: {
  activeView: AppView;
  onChange: (view: AppView) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activate = (view: AppView) => {
    onChange(view);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-3 z-40">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,16,30,0.92),rgba(5,10,18,0.94))] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => activate("home")}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <Music2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="hud-label">LeRobot Console</p>
              <p className="truncate text-lg font-semibold text-white">Music to Motion</p>
            </div>
          </button>

          <nav className="hidden items-center gap-2 lg:flex">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.id}
                variant={item.id === activeView ? "secondary" : "ghost"}
                className="min-w-[138px]"
                onClick={() => activate(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Badge variant="muted">Responsive UI</Badge>
            <Badge variant="accent">shadcn surface</Badge>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileOpen ? (
          <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.id}
                variant={item.id === activeView ? "secondary" : "ghost"}
                className="justify-start"
                onClick={() => activate(item.id)}
              >
                {item.id === "robot" ? <Radio className="mr-2 h-4 w-4" /> : null}
                {item.id === "movements" ? <Sparkles className="mr-2 h-4 w-4" /> : null}
                {item.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
