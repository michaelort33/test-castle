import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Castle, Clock, DollarSign, Trophy, MapPin, ArrowRight, CalendarDays, LogOut, Phone } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Castle className="h-6 w-6 text-primary" />
            <span className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-primary">THE CASTLE</span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/book")}>
              Book Court
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/tournaments")}>
              Tournaments
            </Button>
            {loading ? null : isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                  Dashboard
                </Button>
                {user?.role === "admin" && (
                  <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
                    Admin
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { window.location.href = getLoginUrl(); }}>
                Sign In
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.1) 40px, rgba(255,255,255,0.1) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.1) 40px, rgba(255,255,255,0.1) 41px)`,
          }} />
        </div>
        <div className="container relative py-24 md:py-36">
          <div className="max-w-2xl">
            <h1 className="font-[family-name:var(--font-display)] text-5xl md:text-7xl tracking-wide leading-tight mb-6">
              YOUR COURT<br />AWAITS
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-lg">
              Farmingdale's premier pickleball facility. One court, no distractions, all day availability. Book your session and own the court.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                variant="secondary"
                className="gap-2 font-semibold"
                onClick={() => setLocation("/book")}
              >
                Reserve Now <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Info Cards */}
      <section className="container py-16 md:py-24">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Open All Day</h3>
              <p className="text-muted-foreground">
                The court is available whenever you want. Book 30-minute slots that fit your schedule, from early morning to late evening.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Simple Pricing</h3>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">$25 per 30 min</span> &middot; <span className="font-semibold text-foreground">$50 per hour</span> &middot; <span className="font-semibold text-foreground">$90 for two hours</span>. No hidden fees, no memberships required.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sunday Tournaments</h3>
              <p className="text-muted-foreground">
                Compete in our exclusive Sunday tournaments. Register, play, and track your wins on the leaderboard.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/50 py-16 md:py-24">
        <div className="container">
          <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl tracking-wide text-center mb-12">
            HOW IT WORKS
          </h2>
          <div className="grid gap-8 md:grid-cols-3 max-w-3xl mx-auto">
            {[
              { step: "1", title: "Pick a Time", desc: "Browse the calendar and select your preferred 30-minute slots." },
              { step: "2", title: "Enter Your Info", desc: "Provide your name and phone number. Your confirmation code appears on screen instantly." },
              { step: "3", title: "Play", desc: "Show up and own the court. It's that simple." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground font-[family-name:var(--font-display)] text-2xl flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="container py-16 md:py-24">
        <div className="flex flex-col md:flex-row items-center gap-8 max-w-3xl mx-auto">
          <div className="flex-1">
            <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-wide mb-4">FIND US</h2>
            <div className="flex items-start gap-3 text-muted-foreground">
              <MapPin className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">The Castle</p>
                <p>168 Broadhollow Road</p>
                <p>Farmingdale, NY 11735</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground mt-4">
              <Phone className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">
                  <a href="tel:+16313909661" className="hover:text-primary transition-colors">(631) 390-9661</a>
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground mt-4">
              <CalendarDays className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">Open Daily</p>
                <p>Book any time that works for you</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Castle className="h-5 w-5 text-primary" />
            <span className="font-[family-name:var(--font-display)] text-lg tracking-wide text-primary">THE CASTLE</span>
          </div>
          <div className="text-sm text-muted-foreground text-center md:text-right">
            <p>168 Broadhollow Road, Farmingdale, NY 11735</p>
            <p><a href="tel:+16313909661" className="hover:text-primary transition-colors">(631) 390-9661</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
