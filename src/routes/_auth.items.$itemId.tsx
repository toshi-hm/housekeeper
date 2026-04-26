import React from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Edit, Trash2, Package, MapPin, Calendar, Hash, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExpiryBadge } from '@/components/ExpiryBadge'
import { useItem, useDeleteItem } from '@/hooks/useItems'

export const Route = createFileRoute('/_auth/items/$itemId')({
  component: ItemDetailPage,
})

function ItemDetailPage() {
  const { itemId } = Route.useParams()
  const navigate = useNavigate()
  const { data: item, isLoading, error } = useItem(itemId)
  const deleteItem = useDeleteItem()

  async function handleDelete() {
    if (!confirm('Delete this item?')) return
    await deleteItem.mutateAsync(itemId)
    void navigate({ to: '/' })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: '/' })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-4 text-destructive">
          Item not found.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: '/' })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Link to="/items/$itemId/edit" params={{ itemId }}>
            <Button variant="outline" size="icon">
              <Edit className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => { void handleDelete() }}
            disabled={deleteItem.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Product image */}
      {item.image_url ? (
        <div className="overflow-hidden rounded-lg">
          <img src={item.image_url} alt={item.name} className="w-full object-contain" style={{ maxHeight: 240 }} />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-muted">
          <Package className="h-16 w-16 text-muted-foreground" />
        </div>
      )}

      {/* Name + category */}
      <div>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          {item.category && <Badge variant="secondary">{item.category}</Badge>}
          <ExpiryBadge expiryDate={item.expiry_date} />
        </div>
      </div>

      {/* Details */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <DetailRow icon={<Hash className="h-4 w-4" />} label="Quantity" value={String(item.quantity)} />
          {item.barcode && (
            <DetailRow icon={<Hash className="h-4 w-4" />} label="Barcode" value={item.barcode} />
          )}
          {item.storage_location && (
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={item.storage_location} />
          )}
          {item.purchase_date && (
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Purchased"
              value={new Date(item.purchase_date).toLocaleDateString()}
            />
          )}
          {item.expiry_date && (
            <DetailRow
              icon={<Calendar className="h-4 w-4" />}
              label="Expires"
              value={new Date(item.expiry_date).toLocaleDateString()}
            />
          )}
          {item.notes && (
            <DetailRow icon={<StickyNote className="h-4 w-4" />} label="Notes" value={item.notes} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
