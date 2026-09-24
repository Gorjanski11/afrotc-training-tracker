import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, ShieldHalf } from "lucide-react";
import { auth } from "../lib/firebase";

interface Props {
  signIn: (email: string, password: string) => Promise<void>;
}

export function SignInScreen({ signIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  // Reuses whatever's already typed in the Email field above, rather than asking for it twice.
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password?".');
      return;
    }
    setError(undefined);
    setResetStatus("sending");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetStatus("sent");
    } catch {
      setResetStatus("idle");
      setError("Couldn't send a reset email -- double-check the email above.");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ShieldHalf className="h-4 w-4" />
            </span>
            <CardTitle>Borinkeneers Det 756</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {resetStatus === "sent" && (
              <p className="text-sm text-success">Password reset email sent -- check your inbox (and spam folder).</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn className="h-4 w-4" />
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetStatus === "sending"}
              className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {resetStatus === "sending" ? "Sending..." : "Forgot password?"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
