import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Castle, Clock, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PendingApproval() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user && user.role !== "unapproved_guest") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Castle className="h-8 w-8 text-primary" />
          <span className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-primary">THE CASTLE</span>
        </div>
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Account Pending Approval</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user?.name || "there"}</span>! Your account has been created successfully.
            </p>
            <p className="text-muted-foreground">
              An admin needs to approve your account before you can book court time. You'll be able to access the booking system once approved.
            </p>
            <div className="pt-4">
              <Button variant="outline" className="gap-2" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
