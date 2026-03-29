import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Castle, LogOut, ArrowLeft, Check, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { toDateString } from "@/lib/dates";
import { format } from "date-fns";

// Generate time slots from 6:00 AM to 10:00 PM in 30-min intervals
function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = 6; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function BookCourt() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState<60 | 120>(60);
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<{ confirmationCode: string; endTime: string; price: number } | null>(null);

  const dateStr = toDateString(selectedDate);

  // Public query — no auth required
  const { data: dayReservations, isLoading: slotsLoading } = trpc.reservation.getByDate.useQuery(
    { date: dateStr },
  );

  const createMutation = trpc.reservation.create.useMutation({
    onSuccess: (data) => {
      setConfirmationResult(data);
      utils.reservation.getByDate.invalidate({ date: dateStr });
      if (isAuthenticated) {
        utils.reservation.mine.invalidate();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Calculate which slots are booked
  const bookedRanges = useMemo(() => {
    if (!dayReservations) return [];
    return dayReservations.map((r) => ({
      start: timeToMinutes(r.startTime),
      end: timeToMinutes(r.endTime),
      sessionName: r.sessionName,
    }));
  }, [dayReservations]);

  function isSlotAvailable(slot: string, dur: number) {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + dur;
    if (slotEnd > 22 * 60 + 30) return false;
    return !bookedRanges.some((r) => slotStart < r.end && slotEnd > r.start);
  }

  function getSlotStatus(slot: string): "available" | "booked" | "session" {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + 30;
    const conflict = bookedRanges.find((r) => slotStart < r.end && slotEnd > r.start);
    if (!conflict) return "available";
    if (conflict.sessionName) return "session";
    return "booked";
  }

  function getSlotSessionName(slot: string): string | null {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + 30;
    const conflict = bookedRanges.find((r) => slotStart < r.end && slotEnd > r.start);
    return conflict?.sessionName ?? null;
  }

  function handleBooking() {
    if (!selectedSlot) return;
    createMutation.mutate({
      date: dateStr,
      startTime: selectedSlot,
      duration,
      contactPhone: phone,
      contactEmail: email || undefined,
      guestName: guestName || undefined,
    });
  }

  const price = duration === 60 ? 50 : 90;

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
            <Button variant="ghost" size="sm" onClick={() => setLocation("/tournaments")}>Tournaments</Button>
            {isAuthenticated && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>Dashboard</Button>
                {user?.role === "admin" && (
                  <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>Admin</Button>
                )}
                <Button variant="ghost" size="sm" className="gap-2" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-8 flex-1">
        <Button variant="ghost" size="sm" className="gap-1 mb-4" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <h1 className="text-2xl font-semibold mb-6">Book Court Time</h1>

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          {/* Calendar */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  if (d) {
                    setSelectedDate(d);
                    setSelectedSlot(null);
                  }
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                className="rounded-md"
              />
            </CardContent>
          </Card>

          {/* Time Slots + Booking Form */}
          <div className="space-y-6">
            {/* Duration Selector */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Duration & Price</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button
                    variant={duration === 60 ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => { setDuration(60); setSelectedSlot(null); }}
                  >
                    <Clock className="h-4 w-4 mr-2" /> 1 Hour &mdash; $50
                  </Button>
                  <Button
                    variant={duration === 120 ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => { setDuration(120); setSelectedSlot(null); }}
                  >
                    <Clock className="h-4 w-4 mr-2" /> 2 Hours &mdash; $90
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Time Slots Grid */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Available Slots — {format(selectedDate, "EEEE, MMMM d")}
                </CardTitle>
                <CardDescription>Select a start time for your {duration / 60}-hour session</CardDescription>
              </CardHeader>
              <CardContent>
                {slotsLoading ? (
                  <div className="text-muted-foreground text-sm py-4">Loading availability...</div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const status = getSlotStatus(slot);
                      const available = isSlotAvailable(slot, duration);
                      const sessionName = getSlotSessionName(slot);
                      const isSelected = selectedSlot === slot;

                      return (
                        <button
                          key={slot}
                          disabled={!available}
                          onClick={() => setSelectedSlot(slot)}
                          className={`
                            relative p-2 rounded-md text-sm font-medium transition-all border
                            ${isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : available
                                ? "bg-card hover:bg-accent border-border"
                                : status === "session"
                                  ? "bg-amber-50 border-amber-200 text-amber-700 cursor-not-allowed"
                                  : "bg-muted/50 border-transparent text-muted-foreground cursor-not-allowed"
                            }
                          `}
                        >
                          {slot}
                          {sessionName && (
                            <span className="block text-[10px] truncate mt-0.5 opacity-80">{sessionName}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Booking Form */}
            {selectedSlot && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Confirm Your Booking</CardTitle>
                  <CardDescription>
                    {format(selectedDate, "EEEE, MMMM d")} at {selectedSlot} for {duration / 60} hour{duration === 120 ? "s" : ""} — <span className="font-semibold">${price}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isAuthenticated && (
                    <div className="space-y-2">
                      <Label htmlFor="guestName">Your Name (optional)</Label>
                      <Input
                        id="guestName"
                        type="text"
                        placeholder="John Doe"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!phone || createMutation.isPending}
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    {createMutation.isPending ? "Booking..." : `Book for $${price}`}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog && !confirmationResult} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reservation</DialogTitle>
            <DialogDescription>
              You're about to book the court on {format(selectedDate, "MMMM d, yyyy")} at {selectedSlot} for {duration / 60} hour{duration === 120 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{format(selectedDate, "EEEE, MMMM d")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{selectedSlot}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{duration / 60} hour{duration === 120 ? "s" : ""}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-semibold">${price}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{phone}</span></div>
            {email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{email}</span></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleBooking} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Booking..." : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!confirmationResult} onOpenChange={() => { setConfirmationResult(null); setShowConfirmDialog(false); setSelectedSlot(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <DialogTitle className="text-center">Booking Confirmed!</DialogTitle>
            <DialogDescription className="text-center">
              Your court reservation has been confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Confirmation Code</p>
            <p className="text-2xl font-mono font-bold tracking-wider">{confirmationResult?.confirmationCode}</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{format(selectedDate, "MMMM d, yyyy")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{selectedSlot} - {confirmationResult?.endTime}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">${confirmationResult ? (confirmationResult.price / 100).toFixed(0) : ""}</span></div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => { setConfirmationResult(null); setShowConfirmDialog(false); setSelectedSlot(null); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
