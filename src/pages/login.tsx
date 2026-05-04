import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, KeyRound, MailCheck, UserPlus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { getPostLoginRoute, signInWithGoogle, signInWithMagicLink, signInWithPassword, signUpWithPassword } from "@/services/auth";
import { hasSupabaseEnv } from "@/lib/supabase";
import { toast } from "sonner";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const magicSchema = z.object({
  email: z.string().email(),
});

const signUpSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

type SignInValues = z.infer<typeof signInSchema>;
type MagicValues = z.infer<typeof magicSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M21.8 12.23c0-.76-.07-1.49-.2-2.19H12v4.14h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.78 3.05-4.39 3.05-7.59Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.92.61-2.1.97-3.47.97-2.66 0-4.92-1.8-5.73-4.22H2.86v2.64A10.22 10.22 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.27 13.72A6.13 6.13 0 0 1 5.95 12c0-.6.11-1.18.32-1.72V7.64H2.86A10.15 10.15 0 0 0 1.8 12c0 1.64.39 3.18 1.06 4.36l3.41-2.64Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.06c1.5 0 2.84.52 3.9 1.54l2.92-2.92C17.08 3.07 14.76 2 12 2 7.98 2 4.5 4.3 2.86 7.64l3.41 2.64C7.08 7.86 9.34 6.06 12 6.06Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const { user } = useAuth();
  const [authMode, setAuthMode] = useState("signin");
  const [signInMethod, setSignInMethod] = useState("password");

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const magicForm = useForm<MagicValues>({
    resolver: zodResolver(magicSchema),
    defaultValues: {
      email: "",
    },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const signInMutation = useMutation({
    mutationFn: (values: SignInValues) => signInWithPassword(values.email, values.password),
    onSuccess: () => toast.success("Signed in."),
    onError: (error: Error) => toast.error(error.message),
  });

  const magicMutation = useMutation({
    mutationFn: (values: MagicValues) => signInWithMagicLink(values.email),
    onSuccess: () => toast.success("Magic link sent. Check your inbox."),
    onError: (error: Error) => toast.error(error.message),
  });

  const signUpMutation = useMutation({
    mutationFn: (values: SignUpValues) =>
      signUpWithPassword({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      }),
    onSuccess: () =>
      toast.success("Account created. Check your inbox if email confirmation is enabled."),
    onError: (error: Error) => toast.error(error.message),
  });

  const googleMutation = useMutation({
    mutationFn: signInWithGoogle,
    onError: (error: Error) => toast.error(error.message),
  });

  if (user) {
    return <Navigate replace to={getPostLoginRoute()} />;
  }

  const authDisabled = !hasSupabaseEnv;

  return (
    <div className="grid min-h-screen grid-cols-[1.18fr_0.82fr] overflow-hidden">
      <section className="flex items-center justify-center px-12 py-16">
        <div className="max-w-xl space-y-8">
          <div className="space-y-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Premium CRM Preview Dialer
            </p>
            <h1 className="text-5xl font-semibold leading-tight tracking-tight">
              Built for agents who need speed, not clutter.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Parse files, map columns, switch dial modes instantly, and log call outcomes from one
              polished desktop workspace.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Low-scroll workflows</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Fixed-height workspaces keep call queues, notes, and outcomes on a single screen.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Import precision</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Validate, preview, deduplicate, and persist imports before agents touch the queue.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-slate-950/5 px-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{authMode === "signin" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>
              {authMode === "signin"
                ? "Authenticate with Supabase Auth to access the dialer."
                : "Create an agent account, then land back in the CRM workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!hasSupabaseEnv ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Supabase config is missing.</p>
                <p className="mt-1 text-amber-800">
                  Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
                  before testing sign-in, sign-up, or Google OAuth.
                </p>
              </div>
            ) : null}

            <Tabs value={authMode} onValueChange={setAuthMode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent className="space-y-4" value="signin">
                <Button
                  className="w-full"
                  disabled={authDisabled || googleMutation.isPending}
                  onClick={() => googleMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  <GoogleIcon />
                  {googleMutation.isPending ? "Redirecting to Google..." : "Continue with Google"}
                </Button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/80" />
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    or use email
                  </span>
                  <div className="h-px flex-1 bg-border/80" />
                </div>

                <Tabs value={signInMethod} onValueChange={setSignInMethod}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="password">Password</TabsTrigger>
                    <TabsTrigger value="magic">Magic link</TabsTrigger>
                  </TabsList>

                  <TabsContent value="password">
                    <form
                      className="mt-4 flex flex-col gap-4"
                      onSubmit={signInForm.handleSubmit((values) => signInMutation.mutate(values))}
                    >
                      <Field
                        autoComplete="email"
                        disabled={authDisabled}
                        error={signInForm.formState.errors.email?.message}
                        id="signin-email"
                        label="Email"
                        name="email"
                        register={signInForm.register}
                        type="email"
                      />
                      <Field
                        autoComplete="current-password"
                        disabled={authDisabled}
                        error={signInForm.formState.errors.password?.message}
                        id="signin-password"
                        label="Password"
                        name="password"
                        register={signInForm.register}
                        type="password"
                      />
                      <Button disabled={authDisabled || signInMutation.isPending} type="submit">
                        <KeyRound className="size-4" />
                        {signInMutation.isPending ? "Signing in..." : "Sign in"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="magic">
                    <form
                      className="mt-4 flex flex-col gap-4"
                      onSubmit={magicForm.handleSubmit((values) => magicMutation.mutate(values))}
                    >
                      <Field
                        autoComplete="email"
                        disabled={authDisabled}
                        error={magicForm.formState.errors.email?.message}
                        id="magic-email"
                        label="Email"
                        name="email"
                        register={magicForm.register}
                        type="email"
                      />
                      <Button
                        disabled={authDisabled || magicMutation.isPending}
                        type="submit"
                        variant="secondary"
                      >
                        <MailCheck className="size-4" />
                        {magicMutation.isPending ? "Sending..." : "Send magic link"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="signup">
                <form
                  className="mt-4 flex flex-col gap-4"
                  onSubmit={signUpForm.handleSubmit((values) => signUpMutation.mutate(values))}
                >
                  <Field
                    autoComplete="name"
                    disabled={authDisabled}
                    error={signUpForm.formState.errors.fullName?.message}
                    id="signup-name"
                    label="Full name"
                    name="fullName"
                    register={signUpForm.register}
                    type="text"
                  />
                  <Field
                    autoComplete="email"
                    disabled={authDisabled}
                    error={signUpForm.formState.errors.email?.message}
                    id="signup-email"
                    label="Email"
                    name="email"
                    register={signUpForm.register}
                    type="email"
                  />
                  <Field
                    autoComplete="new-password"
                    disabled={authDisabled}
                    error={signUpForm.formState.errors.password?.message}
                    id="signup-password"
                    label="Password"
                    name="password"
                    register={signUpForm.register}
                    type="password"
                  />
                  <Field
                    autoComplete="new-password"
                    disabled={authDisabled}
                    error={signUpForm.formState.errors.confirmPassword?.message}
                    id="signup-confirm-password"
                    label="Confirm password"
                    name="confirmPassword"
                    register={signUpForm.register}
                    type="password"
                  />
                  <Button disabled={authDisabled || signUpMutation.isPending} type="submit">
                    <UserPlus className="size-4" />
                    {signUpMutation.isPending ? "Creating account..." : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Google sign-in setup</p>
              <p className="mt-1">
                Enable the Google provider in Supabase Auth and add your local/dev redirect URLs in
                both Google Cloud and Supabase before testing OAuth.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({
  autoComplete,
  disabled,
  error,
  id,
  label,
  name,
  register,
  type,
}: {
  autoComplete: string;
  disabled: boolean;
  error?: string;
  id: string;
  label: string;
  name: string;
  register: UseFormRegister<any>;
  type: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete={autoComplete}
        disabled={disabled}
        id={id}
        type={type}
        {...register(name)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
