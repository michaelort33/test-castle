import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { toSafeDate, formatDate } from "@/lib/dates";
import { CalendarDays, Trophy, Clock, ArrowRight, Castle, LogOut, X } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: myReservations, isLoading: resLoading } = trpc.reservation.mine.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role !== "unapproved_guest" }
  );

  const cancelMutation = trpc.reservation.cancel.useMutation({
    onSuccess: () => {
      utils.reservation.mine.invalidate();
      toast.success("Reservation cancelled");
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (user?.role === "unapproved_guest") {
    setLocation("/pending");
    return null;
  }

  const now = new Date();

  const upcomingReservations = myReservations?.filter((r) => {
    const d = toSafeDate(r.date);
    d.setHours(23, 59, 59, 999);
    return r.status === "confirmed" && d >= now;
  }) ?? [];

  const pastReservations = myReservations?.filter((r) => {
    const d = toSafeDate(r.date);
    d.setHours(23, 59, 59, 999);
    return r.status !== "confirmed" || d < now;
  }) ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <Castle className="h-6 w-6 text-primary" />
            <span className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-primary">THE CASTLE</span>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/book")}>Book Court</Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/tournaments")}>Tournaments</Button>
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>Admin</Button>
            )}
            <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </nav>
        </div>
      </header>

      <main className="container py-8 flex-1">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Welcome back, {user?.name || "Player"}</h1>
          <p className="text-muted-foreground mt-1">Manage your court reservations and tournaments.</p>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation("/book")}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center shrink-0">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Book Court Time</h3>
                <p className="text-sm text-muted-foreground">Reserve your next session</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLocation("/tournaments")}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 w-12 h-12 flex items-center justify-center shrink-0">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Tournaments</h3>
                <p className="text-sm text-muted-foreground">View and register for events</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Reservations */}
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Reservations</CardTitle>
            <CardDescription>Your confirmed court bookings</CardDescription>
          </CardHeader>
          <CardContent>
            {resLoading ? (
              <div className="text-muted-foreground text-sm">Loading reservations...</div>
            ) : upcomingReservations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No upcoming reservations</p>
                <Button variant="link" className="mt-2" onClick={() => setLocation("/book")}>
                  Book your first session
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingReservations.map((res) => {
                  const d = toSafeDate(res.date);
                  return (
                    <div key={res.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[60px]">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(d, { month: "short" })}
                          </div>
                          <div className="text-lg font-semibold">
                            {d.getDate()}
                          </div>
                        </div>
                        <div>
                          <p className="font-medium">{res.startTime} - {res.endTime}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-muted-foreground">
                              {res.duration >= 60 ? `${Math.floor(res.duration / 60)}h${res.duration % 60 > 0 ? ` ${res.duration % 60}m` : ""}` : `${res.duration}m`} &middot; ${(res.price / 100).toFixed(0)}
                            </span>
                            {res.sessionName && (
                              <Badge variant="secondary" className="text-xs">{res.sessionName}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Confirmation: <span className="font-mono">{res.confirmationCode}</span>
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => cancelMutation.mutate({ id: res.id })}
                        disabled={cancelMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Reservations */}
        {pastReservations.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Past & Cancelled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pastReservations.slice(0, 10).map((res) => {
                  const d = toSafeDate(res.date);
                  return (
                    <div key={res.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 opacity-70">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[60px]">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(d, { month: "short" })}
                          </div>
                          <div className="text-lg font-semibold">
                            {d.getDate()}
                          </div>
                        </div>
                        <div>
                          <p className="font-medium">{res.startTime} - {res.endTime}</p>
                          <span className="text-sm text-muted-foreground">
                            {res.duration} min
                          </span>
                          {res.status === "cancelled" && (
                            <Badge variant="destructive" className="ml-2 text-xs">Cancelled</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
