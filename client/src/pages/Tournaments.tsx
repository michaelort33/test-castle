import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Castle, LogOut, Trophy, CalendarDays, Users, ArrowLeft, Crown, Medal } from "lucide-react";
import { formatTimeDisplay } from "@/lib/dates";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Tournaments() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery();
  const { data: myRegistrations } = trpc.tournament.myRegistrations.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role !== "unapproved_guest" }
  );

  const registerMutation = trpc.tournament.register.useMutation({
    onSuccess: () => {
      utils.tournament.list.invalidate();
      utils.tournament.myRegistrations.invalidate();
      toast.success("Registered for tournament!");
    },
    onError: (err) => toast.error(err.message),
  });

  const unregisterMutation = trpc.tournament.unregister.useMutation({
    onSuccess: () => {
      utils.tournament.list.invalidate();
      utils.tournament.myRegistrations.invalidate();
      toast.success("Unregistered from tournament");
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  const isRegistered = (tournamentId: number) =>
    myRegistrations?.some((r) => r.registration.tournamentId === tournamentId);

  const upcoming = tournaments?.filter((t) => t.status === "upcoming" || t.status === "in_progress") ?? [];
  const past = tournaments?.filter((t) => t.status === "completed" || t.status === "cancelled") ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <Castle className="h-6 w-6 text-primary" />
            <span className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-primary">THE CASTLE</span>
          </div>
          <nav className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>Dashboard</Button>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/book")}>Book Court</Button>
                {user?.role === "admin" && (
                  <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>Admin</Button>
                )}
                <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => { window.location.href = getLoginUrl(); }}>Sign In</Button>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-8 flex-1">
        {isAuthenticated && (
          <Button variant="ghost" size="sm" className="gap-1 mb-4" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" /> Tournaments
          </h1>
          <p className="text-muted-foreground mt-1">Compete in our exclusive events, primarily on Sundays.</p>
        </div>

        {/* Leaderboard */}
        <LeaderboardSection />

        {isLoading ? (
          <div className="text-muted-foreground py-8">Loading tournaments...</div>
        ) : (
          <div className="space-y-8">
            {/* Upcoming */}
            <div>
              <h2 className="font-semibold text-lg mb-4">Upcoming Events</h2>
              {upcoming.length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No upcoming tournaments. Check back soon!</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {upcoming.map((t) => (
                    <TournamentCard
                      key={t.id}
                      tournament={t}
                      isRegistered={isRegistered(t.id)}
                      canRegister={isAuthenticated && user?.role !== "unapproved_guest"}
                      onRegister={() => registerMutation.mutate({ tournamentId: t.id })}
                      onUnregister={() => unregisterMutation.mutate({ tournamentId: t.id })}
                      isPending={registerMutation.isPending || unregisterMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            {past.length > 0 && (
              <div>
                <h2 className="font-semibold text-lg mb-4">Past Events</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {past.map((t) => (
                    <TournamentCard
                      key={t.id}
                      tournament={t}
                      isRegistered={false}
                      canRegister={false}
                      onRegister={() => {}}
                      onUnregister={() => {}}
                      isPending={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function LeaderboardSection() {
  const { data: leaderboard, isLoading } = trpc.leaderboard.get.useQuery();

  if (isLoading) return null;
  if (!leaderboard || leaderboard.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm mb-8">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Medal className="h-5 w-5 text-amber-500" /> Leaderboard
        </CardTitle>
        <CardDescription>Tournament winners ranked by total wins</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {leaderboard.map((entry) => (
            <div key={entry.userId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  entry.rank === 1 ? "bg-amber-100 text-amber-700" :
                  entry.rank === 2 ? "bg-gray-100 text-gray-700" :
                  entry.rank === 3 ? "bg-orange-100 text-orange-700" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {entry.rank}
                </div>
                <span className="font-medium">{entry.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="font-semibold">{entry.wins}</span>
                <span className="text-sm text-muted-foreground">win{entry.wins !== 1 ? "s" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TournamentCard({
  tournament: t,
  isRegistered,
  canRegister,
  onRegister,
  onUnregister,
  isPending,
}: {
  tournament: {
    id: number;
    name: string;
    date: Date | string;
    startTime: string | null;
    endTime: string | null;
    details: string | null;
    maxParticipants: number | null;
    registrationCount?: number;
    winnerId: number | null;
    status: string;
  };
  isRegistered: boolean | undefined;
  canRegister: boolean | undefined;
  onRegister: () => void;
  onUnregister: () => void;
  isPending: boolean;
}) {
  const isUpcoming = t.status === "upcoming" || t.status === "in_progress";
  const isFull = t.maxParticipants != null && (t.registrationCount ?? 0) >= t.maxParticipants;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t.name}</CardTitle>
          <Badge variant={
            t.status === "upcoming" ? "secondary" :
            t.status === "in_progress" ? "default" :
            t.status === "completed" ? "outline" : "destructive"
          }>
            {t.status === "in_progress" ? "Live" : t.status}
          </Badge>
        </div>
        <CardDescription>
          {new Date(typeof t.date === 'string' ? t.date + "T00:00:00" : t.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {t.startTime && ` · ${formatTimeDisplay(t.startTime)}`}{t.endTime && ` - ${formatTimeDisplay(t.endTime)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {t.details && <p className="text-sm mb-3">{t.details}</p>}
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {t.maxParticipants && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {t.registrationCount ?? 0}/{t.maxParticipants}
              </span>
            )}
            {isFull && (
              <Badge variant="destructive" className="text-xs">Full</Badge>
            )}
          </div>
          {isUpcoming && canRegister && (
            isRegistered ? (
              <Button variant="outline" size="sm" onClick={onUnregister} disabled={isPending}>
                Unregister
              </Button>
            ) : (
              <Button size="sm" onClick={onRegister} disabled={isPending || isFull}>
                {isFull ? "Full" : "Register"}
              </Button>
            )
          )}
          {isRegistered && isUpcoming && (
            <Badge variant="secondary" className="ml-2">Registered</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
