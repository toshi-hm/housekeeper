import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import {
  BarChart2,
  CalendarDays,
  Home,
  LogOut,
  Package,
  Plus,
  Settings,
  ShoppingCart,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { to: "/" as const, icon: Home, label: "Home" },
  { to: "/items/new" as const, icon: Plus, label: "Add Item" },
  { to: "/shopping" as const, icon: ShoppingCart, label: "Shopping" },
  { to: "/stats" as const, icon: BarChart2, label: "Stats" },
  { to: "/settings" as const, icon: Settings, label: "Settings" },
  { to: "/calendar" as const, icon: CalendarDays, label: "Calendar" },
] as const;

const AuthLayout = () => {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    void router.navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-background">
        <div className="flex h-16 items-center gap-2 border-b px-6 font-bold text-primary">
          <Package className="h-5 w-5" />
          Housekeeper
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-primary"
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={() => {
              void handleSignOut();
            }}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-primary">
            <Package className="h-5 w-5" />
            Housekeeper
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-primary"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void handleSignOut();
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 lg:pl-64">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation — 5 items, Add Item centered */}
      <nav className="sticky bottom-0 border-t bg-background lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
          <Link
            to="/"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Link>
          <Link
            to="/shopping"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <ShoppingCart className="h-5 w-5" />
            <span>Shopping</span>
          </Link>
          {/* Add Item — center (position 3/5 with justify-around = exactly 50%) */}
          <Link
            to="/items/new"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <div className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">
              <Plus className="h-6 w-6 text-primary-foreground" />
            </div>
            <span>Add Item</span>
          </Link>
          <Link
            to="/stats"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <BarChart2 className="h-5 w-5" />
            <span>Stats</span>
          </Link>
          <Link
            to="/calendar"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <CalendarDays className="h-5 w-5" />
            <span>Calendar</span>
          </Link>
        </div>
      </nav>
    </div>
  );
};

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthLayout,
});
