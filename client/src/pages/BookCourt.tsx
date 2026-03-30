import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Castle, LogOut, ArrowLeft, Check, GripVertical, ArrowDown, Users, Clock, UserPlus, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { toDateString } from "@/lib/dates";
import { format } from "date-fns";

// Generate time slots from 5:00 AM to 11:00 PM in 30-min intervals
function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = 5; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 23) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTimeDisplay(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Calculate price in cents for a given duration in minutes */
function calculatePrice(durationMins: number): number {
  const slots = durationMins / 30;
  if (slots <= 0) return 0;
  if (slots === 4) return 9000; // 2hr = $90 (discount)
  if (durationMins <= 120) return slots * 2500;
  return 9000 + (slots - 4) * 2500; // Beyond 2hr: $90 base + $25/extra slot
}

type OpenPlaySessionData = {
  id: number;
  date: string | Date;
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  maxPlayers: number;
  status: string;
  confirmedCount: number;
  waitlistedCount: number;
  signups: Array<{
    id: number;
    playerName: string;
    phone: string;
    status: string;
    position: number;
  }>;
};

export default function BookCourt() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Drag-select state: track indices into TIME_SLOTS
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartIndex = useRef<number | null>(null);
  const bookingFormRef = useRef<HTMLDivElement>(null);

  // Open Play join dialog state
  const [openPlayDialog, setOpenPlayDialog] = useState<OpenPlaySessionData | null>(null);
  const [opName, setOpName] = useState("");
  const [opPhone, setOpPhone] = useState(user?.phone || "");
  const [opEmail, setOpEmail] = useState("");
  const [joinResult, setJoinResult] = useState<{ status: string; waitlistPosition: number | null } | null>(null);

  const scrollToForm = () => {
    bookingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState(user?.name || "");
  const [notifyBeforeReservation, setNotifyBeforeReservation] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<{
    confirmationCode: string;
    endTime: string;
    price: number;
  } | null>(null);

  // Cancel-by-code state
  const [showCancelByCode, setShowCancelByCode] = useState(false);
  const [cancelCode, setCancelCode] = useState("");
  const [cancelPhone, setCancelPhone] = useState("");

  const cancelByCodeMutation = trpc.reservation.cancelByCode.useMutation({
    onSuccess: () => {
      toast.success("Reservation cancelled successfully");
      setShowCancelByCode(false);
      setCancelCode("");
      setCancelPhone("");
      utils.reservation.getByDate.invalidate({ date: dateStr });
    },
    onError: (err) => toast.error(err.message),
  });

  const dateStr = toDateString(selectedDate);

  const { data: dayReservations, isLoading: slotsLoading } = trpc.reservation.getByDate.useQuery(
    { date: dateStr },
  );

  const { data: openPlaySessions } = trpc.openPlay.getByDate.useQuery(
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

  const joinMutation = trpc.openPlay.join.useMutation({
    onSuccess: (data) => {
      setJoinResult(data);
      utils.openPlay.getByDate.invalidate({ date: dateStr });
    },
    onError: (err) => toast.error(err.message),
  });

  // Calculate which slots are booked (reservations + open play sessions)
  const bookedRanges = useMemo(() => {
    const ranges: Array<{ start: number; end: number; sessionName: string | null; isOpenPlay?: boolean; openPlaySession?: OpenPlaySessionData }> = [];
    if (dayReservations) {
      for (const r of dayReservations) {
        ranges.push({
          start: timeToMinutes(r.startTime),
          end: timeToMinutes(r.endTime),
          sessionName: r.sessionName,
        });
      }
    }
    if (openPlaySessions) {
      for (const s of openPlaySessions) {
        ranges.push({
          start: timeToMinutes(s.startTime),
          end: timeToMinutes(s.endTime),
          sessionName: s.title,
          isOpenPlay: true,
          openPlaySession: s as OpenPlaySessionData,
        });
      }
    }
    return ranges;
  }, [dayReservations, openPlaySessions]);

  const isSlotBooked = useCallback(
    (slotIndex: number) => {
      const slotStart = timeToMinutes(TIME_SLOTS[slotIndex]);
      const slotEnd = slotStart + 30;
      return bookedRanges.some((r) => !r.isOpenPlay && slotStart < r.end && slotEnd > r.start);
    },
    [bookedRanges]
  );

  const isSlotOpenPlay = useCallback(
    (slotIndex: number) => {
      const slotStart = timeToMinutes(TIME_SLOTS[slotIndex]);
      const slotEnd = slotStart + 30;
      return bookedRanges.find((r) => r.isOpenPlay && slotStart < r.end && slotEnd > r.start);
    },
    [bookedRanges]
  );

  function getSlotSessionName(slotIndex: number): string | null {
    const slotStart = timeToMinutes(TIME_SLOTS[slotIndex]);
    const slotEnd = slotStart + 30;
    const conflict = bookedRanges.find((r) => !r.isOpenPlay && slotStart < r.end && slotEnd > r.start);
    return conflict?.sessionName ?? null;
  }

  // Build contiguous selection between start and current, stopping at booked or open play slots
  const buildContiguousSelection = useCallback(
    (startIdx: number, currentIdx: number): number[] => {
      const minIdx = Math.min(startIdx, currentIdx);
      const maxIdx = Math.max(startIdx, currentIdx);
      const result: number[] = [];

      if (currentIdx >= startIdx) {
        for (let i = startIdx; i <= maxIdx; i++) {
          if (isSlotBooked(i) || isSlotOpenPlay(i)) break;
          result.push(i);
        }
      } else {
        for (let i = startIdx; i >= minIdx; i--) {
          if (isSlotBooked(i) || isSlotOpenPlay(i)) break;
          result.push(i);
        }
        result.sort((a, b) => a - b);
      }
      return result;
    },
    [isSlotBooked, isSlotOpenPlay]
  );

  const handleSlotPointerDown = (index: number) => {
    // Check if this is an open play slot
    const opMatch = isSlotOpenPlay(index);
    if (opMatch?.openPlaySession) {
      setOpenPlayDialog(opMatch.openPlaySession);
      return;
    }
    if (isSlotBooked(index)) return;
    setIsDragging(true);
    dragStartIndex.current = index;
    setSelectedIndices([index]);
  };

  const handleSlotPointerEnter = (index: number) => {
    if (!isDragging || dragStartIndex.current === null) return;
    const selection = buildContiguousSelection(dragStartIndex.current, index);
    setSelectedIndices(selection);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartIndex.current = null;
  };

  // Derived booking info
  const selectedDuration = selectedIndices.length * 30;
  const selectedStartTime = selectedIndices.length > 0 ? TIME_SLOTS[selectedIndices[0]] : null;
  const selectedEndMins = selectedIndices.length > 0
    ? timeToMinutes(TIME_SLOTS[selectedIndices[selectedIndices.length - 1]]) + 30
    : 0;
  const selectedEndTime = selectedEndMins > 0 ? minutesToTime(selectedEndMins) : null;
  const price = calculatePrice(selectedDuration);
  const priceDisplay = (price / 100).toFixed(0);

  function handleBooking() {
    if (!selectedStartTime || selectedDuration === 0) return;
    createMutation.mutate({
      date: dateStr,
      startTime: selectedStartTime,
      duration: selectedDuration,
      contactPhone: phone,
      contactEmail: email || undefined,
      fullName: fullName || undefined,
      notifyBeforeReservation,
    });
  }

  function handleJoinOpenPlay() {
    if (!openPlayDialog || !opName || !opPhone) return;
    joinMutation.mutate({
      sessionId: openPlayDialog.id,
      playerName: opName,
      phone: opPhone,
      email: opEmail || undefined,
    });
  }

  const durationLabel = selectedDuration >= 60
    ? `${Math.floor(selectedDuration / 60)}h${selectedDuration % 60 > 0 ? ` ${selectedDuration % 60}m` : ""}`
    : `${selectedDuration}m`;

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

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold">Book Court Time</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setShowCancelByCode(true)}>
            <XCircle className="h-4 w-4" /> Cancel a Booking
          </Button>
        </div>
        <p className="text-muted-foreground mb-6 text-sm flex items-center gap-1.5">
          <GripVertical className="h-4 w-4" />
          Click and drag across time slots to select your session length. Tap green Open Play slots to join.
        </p>

        {/* Sticky Book Now bar when slots selected */}
        {selectedIndices.length > 0 && (
          <div className="sticky top-16 z-40 -mx-4 px-4 py-3 mb-2 bg-primary text-primary-foreground rounded-lg shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="text-sm font-medium">
              {formatTimeDisplay(selectedStartTime!)} – {formatTimeDisplay(selectedEndTime!)} &middot; {durationLabel} &middot; <span className="font-bold">${priceDisplay}</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 font-semibold shrink-0"
              onClick={scrollToForm}
            >
              Book Now <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

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
                    setSelectedIndices([]);
                  }
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                className="rounded-md"
              />

              {/* Pricing reference */}
              <div className="mt-4 pt-4 border-t space-y-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm mb-2">Pricing</p>
                <div className="flex justify-between"><span>30 minutes</span><span>$25</span></div>
                <div className="flex justify-between"><span>1 hour</span><span>$50</span></div>
                <div className="flex justify-between"><span>1.5 hours</span><span>$75</span></div>
                <div className="flex justify-between"><span>2 hours</span><span className="text-primary font-medium">$90 <span className="text-muted-foreground">(save $10)</span></span></div>
              </div>
            </CardContent>
          </Card>

          {/* Time Slots + Booking Form */}
          <div className="space-y-6">
            {/* Time Slots Grid — Drag Select */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Available Slots — {format(selectedDate, "EEEE, MMMM d")}
                </CardTitle>
                <CardDescription>
                  {selectedIndices.length > 0
                    ? `Selected: ${formatTimeDisplay(selectedStartTime!)} – ${formatTimeDisplay(selectedEndTime!)} (${durationLabel}) — $${priceDisplay}`
                    : "Click a slot to start, then drag to extend your session"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {slotsLoading ? (
                  <div className="text-muted-foreground text-sm py-4">Loading availability...</div>
                ) : (
                  <div
                    className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 select-none"
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  >
                    {TIME_SLOTS.map((slot, index) => {
                      const booked = isSlotBooked(index);
                      const openPlayMatch = isSlotOpenPlay(index);
                      const sessionName = getSlotSessionName(index);
                      const isSelected = selectedIndices.includes(index);
                      const isFirst = selectedIndices.length > 0 && selectedIndices[0] === index;
                      const isLast = selectedIndices.length > 0 && selectedIndices[selectedIndices.length - 1] === index;

                      // Open Play slot styling
                      if (openPlayMatch) {
                        const op = openPlayMatch.openPlaySession!;
                        const spotsLeft = op.maxPlayers - op.confirmedCount;
                        return (
                          <button
                            key={slot}
                            onClick={() => setOpenPlayDialog(op)}
                            className="relative p-2.5 text-sm font-medium transition-all border rounded-md bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                          >
                            <span className="block">{formatTimeDisplay(slot)}</span>
                            <span className="block text-[10px] truncate mt-0.5 font-semibold">{op.title}</span>
                            <span className="block text-[9px] mt-0.5">
                              {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left` : "Waitlist"}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={slot}
                          disabled={booked}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            handleSlotPointerDown(index);
                          }}
                          onPointerEnter={() => handleSlotPointerEnter(index)}
                          className={`
                            relative p-2.5 text-sm font-medium transition-all border touch-none
                            ${isSelected
                              ? `bg-primary text-primary-foreground border-primary shadow-sm ${isFirst ? "rounded-l-md" : ""} ${isLast ? "rounded-r-md" : ""} ${!isFirst && !isLast ? "rounded-none" : ""} ${isFirst && isLast ? "rounded-md" : ""}`
                              : booked
                                ? sessionName
                                  ? "bg-amber-100 border-amber-300 text-amber-800 cursor-not-allowed rounded-md"
                                  : "bg-red-50 border-red-200 text-red-400 cursor-not-allowed rounded-md line-through"
                                : "bg-card hover:bg-accent border-border rounded-md cursor-pointer"
                            }
                          `}
                        >
                          <span className="block">{formatTimeDisplay(slot)}</span>
                          {booked && !sessionName && (
                            <span className="block text-[10px] font-semibold mt-0.5 text-red-400">Booked</span>
                          )}
                          {sessionName && (
                            <span className="block text-[10px] truncate mt-0.5 font-semibold">{sessionName}</span>
                          )}
                          {isSelected && isFirst && selectedIndices.length > 1 && (
                            <span className="absolute -bottom-5 left-0 text-[10px] text-primary font-medium whitespace-nowrap">
                              Start
                            </span>
                          )}
                          {isSelected && isLast && selectedIndices.length > 1 && (
                            <span className="absolute -bottom-5 right-0 text-[10px] text-primary font-medium whitespace-nowrap">
                              End
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 mt-8 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-card border border-border" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-primary" />
                    <span>Selected</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-red-50 border border-red-200" />
                    <span>Booked</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
                    <span>Session</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-300" />
                    <span>Open Play</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Open Play Sessions for this date */}
            {openPlaySessions && openPlaySessions.length > 0 && (
              <Card className="border-0 shadow-sm border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Open Play Sessions
                  </CardTitle>
                  <CardDescription>Join a group session — tap any session to sign up</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openPlaySessions.map((session) => {
                    const spotsLeft = session.maxPlayers - session.confirmedCount;
                    return (
                      <div
                        key={session.id}
                        className="border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => setOpenPlayDialog(session as OpenPlaySessionData)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sm">{session.title}</h3>
                          <Badge variant={spotsLeft > 0 ? "default" : "secondary"} className={spotsLeft > 0 ? "bg-emerald-600" : ""}>
                            {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left` : "Waitlist Open"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeDisplay(session.startTime)} – {formatTimeDisplay(session.endTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {session.confirmedCount}/{session.maxPlayers} players
                          </span>
                          {session.waitlistedCount > 0 && (
                            <span className="text-amber-600">{session.waitlistedCount} waitlisted</span>
                          )}
                        </div>
                        {session.description && (
                          <p className="text-xs text-muted-foreground mt-1">{session.description}</p>
                        )}
                        {/* Player names */}
                        {session.signups && session.signups.filter((s: any) => s.status === "confirmed").length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {session.signups.filter((s: any) => s.status === "confirmed").map((s: any) => (
                              <Badge key={s.id} variant="outline" className="text-[10px] font-normal">
                                {s.playerName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Booking Form — appears when slots are selected */}
            {selectedIndices.length > 0 && (
              <div ref={bookingFormRef} className="scroll-mt-32">
              <Card className="border-0 shadow-sm border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Confirm Your Booking</CardTitle>
                  <CardDescription>
                    {format(selectedDate, "EEEE, MMMM d")} &middot; {formatTimeDisplay(selectedStartTime!)} – {formatTimeDisplay(selectedEndTime!)} &middot; {durationLabel} — <span className="font-semibold text-foreground">${priceDisplay}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(631) 555-1234"
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
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="notify"
                      checked={notifyBeforeReservation}
                      onCheckedChange={(checked) => setNotifyBeforeReservation(checked === true)}
                    />
                    <Label htmlFor="notify" className="text-sm font-normal cursor-pointer">
                      Notify me as my reservation approaches
                    </Label>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!phone || createMutation.isPending}
                    onClick={() => setShowConfirmDialog(true)}
                  >
                    {createMutation.isPending ? "Booking..." : `Book ${durationLabel} for $${priceDisplay}`}
                  </Button>
                </CardContent>
              </Card>
              </div>
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
              You're about to book the court on {format(selectedDate, "MMMM d, yyyy")} from {selectedStartTime && formatTimeDisplay(selectedStartTime)} to {selectedEndTime && formatTimeDisplay(selectedEndTime)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{format(selectedDate, "EEEE, MMMM d")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{selectedStartTime && formatTimeDisplay(selectedStartTime)} – {selectedEndTime && formatTimeDisplay(selectedEndTime)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationLabel} ({selectedIndices.length} slot{selectedIndices.length > 1 ? "s" : ""})</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-semibold">${priceDisplay}</span></div>
            {fullName && <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{fullName}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{phone}</span></div>
            {email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{email}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Notifications</span><span className="font-medium">{notifyBeforeReservation ? "Yes" : "No"}</span></div>
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
      <Dialog open={!!confirmationResult} onOpenChange={() => { setConfirmationResult(null); setShowConfirmDialog(false); setSelectedIndices([]); }}>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{selectedStartTime && formatTimeDisplay(selectedStartTime)} – {confirmationResult?.endTime && formatTimeDisplay(confirmationResult.endTime)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{durationLabel}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">${confirmationResult ? (confirmationResult.price / 100).toFixed(0) : ""}</span></div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => { setConfirmationResult(null); setShowConfirmDialog(false); setSelectedIndices([]); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Play Join Dialog */}
      <Dialog open={!!openPlayDialog && !joinResult} onOpenChange={(open) => { if (!open) { setOpenPlayDialog(null); setOpName(""); setOpPhone(user?.phone || ""); setOpEmail(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              {openPlayDialog?.title}
            </DialogTitle>
            <DialogDescription>
              {format(selectedDate, "EEEE, MMMM d")} &middot; {openPlayDialog && formatTimeDisplay(openPlayDialog.startTime)} – {openPlayDialog && formatTimeDisplay(openPlayDialog.endTime)}
            </DialogDescription>
          </DialogHeader>

          {openPlayDialog && (
            <div className="space-y-4">
              {openPlayDialog.description && (
                <p className="text-sm text-muted-foreground">{openPlayDialog.description}</p>
              )}

              {/* Player list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Players ({openPlayDialog.confirmedCount}/{openPlayDialog.maxPlayers})</h4>
                  {openPlayDialog.confirmedCount >= openPlayDialog.maxPlayers && (
                    <Badge variant="secondary" className="text-amber-600">Full — Waitlist Available</Badge>
                  )}
                </div>
                {openPlayDialog.signups.filter(s => s.status === "confirmed").length > 0 ? (
                  <div className="space-y-1">
                    {openPlayDialog.signups.filter(s => s.status === "confirmed").map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-emerald-50">
                        <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <span>{s.playerName}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No players yet — be the first to join!</p>
                )}

                {/* Waitlist */}
                {openPlayDialog.signups.filter(s => s.status === "waitlisted").length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium text-amber-600 mb-1">Waitlist</h4>
                    {openPlayDialog.signups.filter(s => s.status === "waitlisted").map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-amber-50">
                        <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">W{i + 1}</span>
                        <span>{s.playerName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Join form */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {openPlayDialog.confirmedCount >= openPlayDialog.maxPlayers ? "Join Waitlist" : "Join Session"}
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="opName">Your Name *</Label>
                  <Input id="opName" placeholder="John Doe" value={opName} onChange={(e) => setOpName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="opPhone">Phone Number *</Label>
                  <Input id="opPhone" type="tel" placeholder="(631) 555-1234" value={opPhone} onChange={(e) => setOpPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="opEmail">Email (optional)</Label>
                  <Input id="opEmail" type="email" placeholder="you@example.com" value={opEmail} onChange={(e) => setOpEmail(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenPlayDialog(null); setOpName(""); setOpPhone(user?.phone || ""); setOpEmail(""); }}>Cancel</Button>
            <Button
              onClick={handleJoinOpenPlay}
              disabled={!opName || !opPhone || joinMutation.isPending}
              className={openPlayDialog && openPlayDialog.confirmedCount >= openPlayDialog.maxPlayers ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              {joinMutation.isPending ? "Joining..." : openPlayDialog && openPlayDialog.confirmedCount >= openPlayDialog.maxPlayers ? "Join Waitlist" : "Join Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel By Code Dialog */}
      <Dialog open={showCancelByCode} onOpenChange={setShowCancelByCode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Cancel Reservation
            </DialogTitle>
            <DialogDescription>
              Enter your confirmation code and phone number to cancel your reservation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cancelCode">Confirmation Code</Label>
              <Input
                id="cancelCode"
                placeholder="e.g., ABCD1234"
                value={cancelCode}
                onChange={(e) => setCancelCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancelPhone">Phone Number</Label>
              <Input
                id="cancelPhone"
                type="tel"
                placeholder="(631) 555-1234"
                value={cancelPhone}
                onChange={(e) => setCancelPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelByCode(false)}>Back</Button>
            <Button
              variant="destructive"
              disabled={!cancelCode || !cancelPhone || cancelByCodeMutation.isPending}
              onClick={() => cancelByCodeMutation.mutate({ confirmationCode: cancelCode, contactPhone: cancelPhone })}
            >
              {cancelByCodeMutation.isPending ? "Cancelling..." : "Cancel Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Play Join Success Dialog */}
      <Dialog open={!!joinResult} onOpenChange={() => { setJoinResult(null); setOpenPlayDialog(null); setOpName(""); setOpPhone(user?.phone || ""); setOpEmail(""); }}>
        <DialogContent>
          <DialogHeader>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${joinResult?.status === "confirmed" ? "bg-emerald-100" : "bg-amber-100"}`}>
              {joinResult?.status === "confirmed"
                ? <Check className="h-8 w-8 text-emerald-600" />
                : <Clock className="h-8 w-8 text-amber-600" />
              }
            </div>
            <DialogTitle className="text-center">
              {joinResult?.status === "confirmed" ? "You're In!" : "Added to Waitlist"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {joinResult?.status === "confirmed"
                ? `You've been added to ${openPlayDialog?.title}. See you on the court!`
                : `The session is full. You're #${joinResult?.waitlistPosition} on the waitlist. We'll notify you if a spot opens up.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => { setJoinResult(null); setOpenPlayDialog(null); setOpName(""); setOpPhone(user?.phone || ""); setOpEmail(""); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
