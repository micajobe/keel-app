"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError("Couldn't send link. Check the email address and try again.");
    } else {
      setSent(true);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-10 w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Keel</h1>
          <p className="text-sm text-muted-foreground">Stay on course.</p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-foreground/80">Check your email.</p>
            <p className="text-xs text-muted-foreground">
              A sign-in link is on its way to {email}
            </p>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex flex-col gap-4 w-full">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-lg border border-border bg-transparent text-sm focus:outline-none focus:border-foreground/50 transition-colors"
            />
            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 rounded-full bg-foreground text-background text-sm font-medium disabled:opacity-30 hover:opacity-80 transition-opacity"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
