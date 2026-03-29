import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { toSafeDate, formatDate, formatTimeDisplay as formatTimeAMPM } from "@/lib/dates";
import { Castle, LogOut, Users, CalendarDays, Trophy, BarChart3, Check, X, Shield, Tag, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Admin() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }
  if (!isAuthenticated) { window.location.href = getLoginUrl(); return null; }
  if (user?.role !== "admin") { setLocation("/dashboard"); return null; }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <Castle className="h-6 w-6 text-primary" />
            <span className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-primary">THE CASTLE</span>
            <Badge variant="secondary" className="ml-2">Admin</Badge>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>My Dashboard</Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/book")}>Book Court</Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="container py-8 flex-1">
        <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>
        <StatsCards />
        <Tabs defaultValue="users" className="mt-8">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users</TabsTrigger>
            <TabsTrigger value="reservations" className="gap-2"><CalendarDays className="h-4 w-4" /> Reservations</TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2"><Tag className="h-4 w-4" /> Session Blocks</TabsTrigger>
            <TabsTrigger value="tournaments" className="gap-2"><Trophy className="h-4 w-4" /> Tournaments</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="reservations"><ReservationsTab /></TabsContent>
          <TabsContent value="sessions"><SessionBlocksTab /></TabsContent>
          <TabsContent value="tournaments"><TournamentsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatsCards() {
  const { data: stats } = trpc.admin.stats.useQuery();
  const items = [
    { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-blue-600" },
    { label: "Pending Approval", value: stats?.pendingUsers ?? "—", icon: Shield, color: "text-amber-600" },
    { label: "Active Reservations", value: stats?.totalReservations ?? "—", icon: CalendarDays, color: "text-green-600" },
    { label: "Upcoming Tournaments", value: stats?.upcomingTournaments ?? "—", icon: Trophy, color: "text-purple-600" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-semibold mt-1">{item.value}</p>
              </div>
              <item.icon className={`h-8 w-8 ${item.color} opacity-60`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const { data: users, isLoading } = trpc.admin.users.list.useQuery();
  const utils = trpc.useUtils();

  const approveMutation = trpc.admin.users.approve.useMutation({
    onSuccess: () => { utils.admin.users.list.invalidate(); utils.admin.stats.invalidate(); toast.success("User approved"); },
    onError: (err) => toast.error(err.message),
  });

  const setRoleMutation = trpc.admin.users.setRole.useMutation({
    onSuccess: () => { utils.admin.users.list.invalidate(); utils.admin.stats.invalidate(); toast.success("Role updated"); },
    onError: (err) => toast.error(err.message),
  });

  const pending = users?.filter((u) => u.role === "unapproved_guest") ?? [];
  const approved = users?.filter((u) => u.role !== "unapproved_guest") ?? [];

  if (isLoading) return <div className="text-muted-foreground py-4">Loading users...</div>;

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-amber-400">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              Pending Approval ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pending.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50">
                  <div>
                    <p className="font-medium">{u.name || "Unnamed"}</p>
                    <p className="text-sm text-muted-foreground">{u.email || "No email"}</p>
                    <p className="text-xs text-muted-foreground">Signed up {new Date(u.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1" onClick={() => approveMutation.mutate({ userId: u.id })} disabled={approveMutation.isPending}>
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">All Users ({approved.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {approved.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">{u.name || "Unnamed"}</p>
                  <p className="text-sm text-muted-foreground">{u.email || "No email"} {u.phone ? `· ${u.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    {u.role}
                  </Badge>
                  <Select
                    value={u.role}
                    onValueChange={(role) => setRoleMutation.mutate({ userId: u.id, role: role as "admin" | "guest" | "unapproved_guest" })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="guest">Guest</SelectItem>
                      <SelectItem value="unapproved_guest">Unapproved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReservationsTab() {
  const { data: reservations, isLoading } = trpc.admin.reservations.list.useQuery();
  const utils = trpc.useUtils();

  const cancelMutation = trpc.admin.reservations.cancel.useMutation({
    onSuccess: () => { utils.admin.reservations.list.invalidate(); utils.admin.stats.invalidate(); toast.success("Reservation cancelled"); },
    onError: (err) => toast.error(err.message),
  });

  const [nameDialog, setNameDialog] = useState<{ id: number; current: string } | null>(null);
  const [sessionName, setSessionName] = useState("");

  const nameSlotMutation = trpc.admin.reservations.nameSlot.useMutation({
    onSuccess: () => { utils.admin.reservations.list.invalidate(); setNameDialog(null); toast.success("Session named"); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-muted-foreground py-4">Loading reservations...</div>;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">All Reservations</CardTitle>
          <CardDescription>Manage and label court bookings</CardDescription>
        </CardHeader>
        <CardContent>
          {!reservations || reservations.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No reservations yet.</p>
          ) : (
            <div className="space-y-2">
              {reservations.map(({ reservation: r, userName }) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[50px]">
                      <div className="text-xs text-muted-foreground">
                        {formatDate(r.date, { month: "short" })}
                      </div>
                      <div className="text-lg font-semibold">
                        {toSafeDate(r.date).getDate()}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">{formatTimeAMPM(r.startTime)} - {formatTimeAMPM(r.endTime)}</p>
                      <p className="text-sm text-muted-foreground">
                        {(r as any).fullName || userName || "Unknown"} · {r.contactPhone} · {r.duration >= 60 ? `${Math.floor(r.duration / 60)}h${r.duration % 60 > 0 ? ` ${r.duration % 60}m` : ""}` : `${r.duration}m`} · ${(r.price / 100).toFixed(0)} · <span className="font-mono text-xs">{r.confirmationCode}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.sessionName && <Badge variant="secondary" className="text-xs">{r.sessionName}</Badge>}
                        <Badge variant={r.status === "confirmed" ? "default" : "destructive"} className="text-xs">{r.status}</Badge>
                        {(r as any).notifyBeforeReservation && <Badge variant="outline" className="text-xs">Notify</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => { setNameDialog({ id: r.id, current: r.sessionName || "" }); setSessionName(r.sessionName || ""); }}
                    >
                      <Tag className="h-3 w-3 mr-1" /> Name
                    </Button>
                    {r.status === "confirmed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive text-xs"
                        onClick={() => cancelMutation.mutate({ id: r.id })}
                      >
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!nameDialog} onOpenChange={() => setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name Time Slot</DialogTitle>
            <DialogDescription>Assign a label like "Open Play", "Drilling", or "Lessons"</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Session Name</Label>
            <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g., Open Play" />
            <div className="flex flex-wrap gap-2 mt-2">
              {["Open Play", "Drilling", "Lessons", "Private"].map((name) => (
                <Badge key={name} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setSessionName(name)}>
                  {name}
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>Cancel</Button>
            <Button onClick={() => nameDialog && nameSlotMutation.mutate({ id: nameDialog.id, sessionName })} disabled={nameSlotMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionBlocksTab() {
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [sessionName, setSessionName] = useState("");

  const createBlockMutation = trpc.admin.reservations.createBlock.useMutation({
    onSuccess: () => {
      utils.admin.reservations.list.invalidate();
      toast.success("Session block created");
      setSessionName("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Create Session Block</CardTitle>
        <CardDescription>Block out time for named sessions like Open Play, Drilling, or Lessons</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-2 block">Date</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-md border"
            />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Session Name</Label>
              <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g., Open Play" />
              <div className="flex flex-wrap gap-2">
                {["Open Play", "Drilling", "Lessons", "Tournament"].map((name) => (
                  <Badge key={name} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setSessionName(name)}>
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <Button
              className="w-full gap-2"
              disabled={!sessionName || createBlockMutation.isPending}
              onClick={() => createBlockMutation.mutate({
                date: format(selectedDate, "yyyy-MM-dd"),
                startTime,
                endTime,
                sessionName,
              })}
            >
              <Plus className="h-4 w-4" />
              {createBlockMutation.isPending ? "Creating..." : "Create Session Block"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TournamentsTab() {
  const { data: tournaments, isLoading } = trpc.tournament.list.useQuery();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date>(() => new Date());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [details, setDetails] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");

  const createMutation = trpc.tournament.create.useMutation({
    onSuccess: () => {
      utils.tournament.list.invalidate();
      utils.admin.stats.invalidate();
      setShowCreate(false);
      setName("");
      setDetails("");
      toast.success("Tournament created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMutation = trpc.tournament.updateStatus.useMutation({
    onSuccess: () => { utils.tournament.list.invalidate(); toast.success("Status updated"); },
    onError: (err) => toast.error(err.message),
  });

  // Winner selection
  const [winnerDialog, setWinnerDialog] = useState<number | null>(null);
  const { data: registrations } = trpc.tournament.registrations.useQuery(
    { tournamentId: winnerDialog! },
    { enabled: !!winnerDialog }
  );

  const setWinnerMutation = trpc.tournament.setWinner.useMutation({
    onSuccess: () => { utils.tournament.list.invalidate(); setWinnerDialog(null); toast.success("Winner set!"); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-muted-foreground py-4">Loading tournaments...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Manage Tournaments</h3>
        <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Create Tournament
        </Button>
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No tournaments yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <Card key={t.id} className="border-0 shadow-sm">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{t.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(t.date, { weekday: "long", month: "long", day: "numeric" })}
                      {t.startTime && ` · ${formatTimeAMPM(t.startTime)}`}{t.endTime && ` - ${formatTimeAMPM(t.endTime)}`}
                    </p>
                    {t.details && <p className="text-sm mt-1">{t.details}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      t.status === "upcoming" ? "secondary" :
                      t.status === "in_progress" ? "default" :
                      t.status === "completed" ? "outline" : "destructive"
                    }>{t.status}</Badge>
                    <Select
                      value={t.status}
                      onValueChange={(status) => updateStatusMutation.mutate({
                        tournamentId: t.id,
                        status: status as "upcoming" | "in_progress" | "completed" | "cancelled",
                      })}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setWinnerDialog(t.id)}>
                      <Trophy className="h-3 w-3 mr-1" /> Set Winner
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Tournament Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
            <DialogDescription>Set up a new tournament event</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tournament Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Sunday Showdown" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                className="rounded-md border"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Participants (optional)</Label>
              <Input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="Leave blank for unlimited" />
            </div>
            <div className="space-y-2">
              <Label>Details (optional)</Label>
              <Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tournament description..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!name || createMutation.isPending}
              onClick={() => createMutation.mutate({
                name,
                date: format(date, "yyyy-MM-dd"),
                startTime,
                endTime,
                details: details || undefined,
                maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
              })}
            >
              {createMutation.isPending ? "Creating..." : "Create Tournament"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Winner Dialog */}
      <Dialog open={!!winnerDialog} onOpenChange={() => setWinnerDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Tournament Winner</DialogTitle>
            <DialogDescription>Select the winner from registered participants</DialogDescription>
          </DialogHeader>
          {registrations && registrations.length > 0 ? (
            <div className="space-y-2">
              {registrations.map((reg) => (
                <div key={reg.registration.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{reg.userName || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">{reg.userEmail || ""}</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => setWinnerMutation.mutate({ tournamentId: winnerDialog!, winnerId: reg.registration.userId })}
                    disabled={setWinnerMutation.isPending}
                  >
                    <Trophy className="h-3 w-3" /> Winner
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4">No participants registered yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
