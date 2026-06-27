import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useNavigate } from "react-router-dom";

import { Brandmark } from "@/components/layout";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth, useLogin } from "@/hooks/use-auth";

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const login = useLogin();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  if (!isLoading && isAuthenticated) return <Navigate to="/app" replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate("/app", { replace: true });
    } catch (err) {
      setError("password", {
        message:
          err instanceof ApiError ? err.message : "Could not sign in. Try again.",
      });
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4 py-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-card shadow-soft md:grid-cols-2">
        {/* Brand side */}
        <div className="relative hidden flex-col overflow-hidden bg-[radial-gradient(700px_380px_at_80%_-10%,rgba(237,162,59,0.18),transparent_60%),linear-gradient(160deg,#0A4339,#062B24)] p-10 text-[#eaf6f1] md:flex">
          <Brandmark className="text-[#cfe9df]" />
          <div className="mt-auto">
            <h2 className="font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-white">
              Reception that
              <br />
              never sleeps.
            </h2>
            <p className="mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-[#afd2c8]">
              Run today's queue, issue tokens and reach patients — all from one
              calm cockpit.
            </p>
          </div>
          <div className="mt-7 flex max-w-[280px] flex-col gap-2">
            <div className="self-start rounded-[13px] rounded-bl-[4px] bg-white/12 px-3 py-2 text-[12.5px]">
              You're #2 in line — about 18 min.
            </div>
            <div className="self-end rounded-[13px] rounded-br-[4px] bg-mint px-3 py-2 text-[12.5px] text-ink">
              arrived
            </div>
          </div>
        </div>

        {/* Form side */}
        <div className="flex items-center justify-center p-8 sm:p-10">
          <div className="w-full max-w-[320px]">
            <div className="mb-6 md:hidden">
              <Brandmark />
            </div>
            <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">
              Staff sign in
            </h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Patients book on WhatsApp — this is for clinic staff.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  aria-invalid={Boolean(errors.email)}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="mt-5 text-center text-xs text-faint">
              Secured with an httpOnly session cookie
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
