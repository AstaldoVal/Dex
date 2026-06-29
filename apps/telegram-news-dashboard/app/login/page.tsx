"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError((j as { error?: string }).error || "login failed");
        return;
      }
      router.replace(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-semibold">Telegram news dashboard</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Введіть пароль (змінна середовища DASHBOARD_PASSWORD на Vercel).
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-100"
          placeholder="Пароль"
          autoComplete="current-password"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-zinc-100 px-3 py-2 font-medium text-zinc-900 disabled:opacity-50"
        >
          {loading ? "…" : "Увійти"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-400">Завантаження…</div>}>
      <LoginForm />
    </Suspense>
  );
}
