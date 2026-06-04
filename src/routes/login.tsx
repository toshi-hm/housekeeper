import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Package } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, translateAuthError } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const LoginPage = () => {
  const navigate = useNavigate();
  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const clearErrors = () => {
    setFieldErrors({});
    setGlobalError(null);
  };

  const handleLogin = async () => {
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) errs[issue.path[0] as string] = issue.message;
      setFieldErrors(errs);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
    void navigate({ to: "/" });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearErrors();
    setIsLoading(true);
    try {
      await handleLogin();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "認証に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

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
          <CardTitle>サインイン</CardTitle>
          <CardDescription>登録済みのメールアドレスとパスワードでサインインします</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4"
          >
            {globalError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {globalError}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password">パスワード</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              サインイン
            </Button>

            <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              現在、新規ユーザー登録は受け付けていません。登録済みのアカウントでサインインしてください。
            </div>

            <div className="text-center">
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                パスワードを忘れた方はこちら
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
