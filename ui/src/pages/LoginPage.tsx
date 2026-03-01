import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Shield, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [email,  setEmail]    = useState("admin@demo.com");
  const [tenant, setTenant]   = useState("demo-corp");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login({ email, password, tenant_slug: tenant });
      localStorage.setItem("access_token",  data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      await navigate({ to: "/" });
    } catch {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 mb-2">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">SentinelEdge</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-surface border border-border rounded-xl p-6">
          <div className="space-y-1.5">
            <Label htmlFor="tenant">Organization</Label>
            <Input
              id="tenant"
              placeholder="demo-corp"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              autoComplete="organization"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@demo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/* Dev hint */}
        <p className="text-center text-xs text-muted-foreground/60">
          dev: admin@demo.com / test1234 / demo-corp
        </p>
      </div>
    </div>
  );
}
