import { Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyProfile } from "@/lib/server/profile";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Catalog" },
  { to: "/drops", label: "Drops" },
  { to: "/tests", label: "Tests" },
  { to: "/library", label: "COA" },
  { to: "/desk", label: "Desk" },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!user) {
      setAdmin(false);
      return;
    }
    getMyProfile()
      .then((p) => setAdmin(p.is_admin))
      .catch(() => setAdmin(false));
  }, [user]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-display text-2xl tracking-tight">
            Clearlot
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-2 text-sm text-muted hover:bg-elevated hover:text-fg"
                activeProps={{ className: "text-fg bg-elevated" }}
              >
                {l.label}
              </Link>
            ))}
            {admin ? (
              <Link to="/admin" className="rounded-md px-3 py-2 text-sm text-muted hover:bg-elevated hover:text-fg">
                Admin
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/cart" className="text-sm text-muted hover:text-fg">
              Cart
            </Link>
            <Link to="/orders" className="hidden text-sm text-muted hover:text-fg sm:inline">
              Orders
            </Link>
            <div className="h-8 w-8">
              {isPending ? <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" /> : user ? <UserButton /> : (
                <SignedOut>
                  <Link to="/login" className="text-sm text-accent">
                    Sign in
                  </Link>
                </SignedOut>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 md:hidden">
        <div className="grid grid-cols-5 text-center text-xs text-muted">
          {links.slice(0, 5).map((l) => (
            <Link key={l.to} to={l.to} className={cn("py-3")} activeProps={{ className: "text-fg" }}>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
      <SignedIn>{null}</SignedIn>
    </div>
  );
}

export function PageTitle({ kicker, title, body }: { kicker?: string; title: string; body?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      {kicker ? <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">{kicker}</p> : null}
      <h1 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">{title}</h1>
      {body ? <p className="mt-3 text-muted">{body}</p> : null}
    </div>
  );
}
