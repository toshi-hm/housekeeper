import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import React, { useState } from 'react'
import { Package, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      }
      void navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Package className="h-8 w-8" />
          Housekeeper
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Home inventory management</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle>{mode === 'login' ? 'Sign in' : 'Create account'}</CardTitle>
          <CardDescription>
            {mode === 'login' ? 'Enter your credentials to continue' : 'Sign up to start tracking your inventory'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError(null)
              }}
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
