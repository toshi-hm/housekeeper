import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";
import { Home, Plus, LogOut, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    void router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-primary">
            <Package className="h-5 w-5" />
            Housekeeper
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void handleSignOut();
            }}
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="sticky bottom-0 border-t bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
          <Link
            to="/"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Link>
          <Link
            to="/items/new"
            className="flex flex-col items-center gap-1 text-xs text-muted-foreground [&.active]:text-primary"
          >
            <Plus className="h-5 w-5" />
            <span>Add Item</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
