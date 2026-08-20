import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { AuthContext, type AuthContextValue } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

// #828: リフレッシュトークンの失効時、supabase-jsは自動的にセッションを破棄して
// "SIGNED_OUT" イベントを発火する（ユーザー自身のサインアウトと同じイベント）。
// これらのパス自体はセッションが無いことを許容している（/login はコード入力
// ステップの表示に、/forgot-password はパスワードリセットフローに必要なため）ので、
// 遷移中の無限ループや意図しないリダイレクトを避ける。
const PUBLIC_PATHS = ["/login", "/forgot-password"];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * session を Context 経由でアプリ全体に提供し、`onAuthStateChange` で
 * セッション切れ（リフレッシュ失敗によるサインアウトを含む）を能動的に検知して
 * `/login` へ誘導する（#828, docs/specs/features/auth.md）。
 *
 * 各ルートの `beforeLoad` による初回アクセス時のガードとは独立して、既に
 * マウント済みの画面上でセッションが失効した場合もカバーする。
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [session, setSession] = useState<AuthContextValue["session"]>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === "SIGNED_OUT" && !isPublicPath(router.state.location.pathname)) {
        void router.navigate({ to: "/login" });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  return <AuthContext.Provider value={{ session }}>{children}</AuthContext.Provider>;
};
