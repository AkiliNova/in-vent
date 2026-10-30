import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";

const AdminLogin = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = await login(email, password);
      navigate(user.role === "super_admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full glass p-8 rounded-2xl">
        <Link to="/" className="block mb-6">
          <img src="/assets/logo.png" alt="Tikooh" className="h-10 object-contain" />
        </Link>
        <h1 className="text-2xl font-bold mb-1 text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground mb-6">Sign in to manage your events and wallet.</p>

        {error && (
          <div role="alert" className="mb-4 p-3 text-sm text-destructive bg-destructive/15 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground mt-6 text-center">
          New organiser? <Link to="/onboarding" className="text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
