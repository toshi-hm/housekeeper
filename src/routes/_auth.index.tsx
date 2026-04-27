import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useItems } from "@/hooks/useItems";
import { getExpiryStatus } from "@/types/item";

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: items = [], isLoading, error } = useItems();
  const [search, setSearch] = useState("");

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.category?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (item.barcode?.includes(search) ?? false),
  );

  const urgentCount = items.filter((item) => {
    const status = getExpiryStatus(item.expiry_date);
    return status === "expired" || status === "expiring-soon";
  }).length;

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive p-4 text-destructive">
        Failed to load items. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">{items.length} items</p>
        </div>
        <Link to="/items/new">
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </Link>
      </div>

      {/* Expiry alerts banner */}
      {urgentCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <span className="font-medium">
              {urgentCount} item{urgentCount > 1 ? "s" : ""}
            </span>{" "}
            {urgentCount > 1 ? "are" : "is"} expiring soon or already expired.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Item grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          {items.length === 0 ? (
            <>
              <p className="text-lg font-medium">No items yet</p>
              <p className="mt-1 text-sm">Add your first item to get started.</p>
              <Link to="/items/new" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No results</p>
              <p className="mt-1 text-sm">Try a different search term.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
