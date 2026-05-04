import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { updateProfile } from "@/services/auth";
import { toast } from "sonner";

const settingsSchema = z.object({
  full_name: z.string().min(2),
  status: z.enum(["online", "offline", "busy", "break"]),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      full_name: profile?.full_name ?? "",
      status: profile?.status ?? "offline",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: SettingsValues) => {
      if (!profile) return;
      await updateProfile(profile.id, values);
    },
    onSuccess: async () => {
      await refreshProfile();
      toast.success("Settings updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Agent profile</CardTitle>
          <CardDescription>Control the identity shown around the dialer workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" {...form.register("full_name")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" disabled value={profile?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value) => form.setValue("status", value as SettingsValues["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment checklist</CardTitle>
          <CardDescription>What this MVP expects from the Supabase project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            Auth: enable email/password and magic links.
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            Storage: create a <code>dialer-imports</code> bucket for original uploads.
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            Database: apply the migration in <code>supabase/migrations</code> to create tables, RLS,
            triggers, and count synchronization.
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            MCP: the workspace has a local <code>.mcp.json</code>; reload Codex to bind this session to
            project <code>uhnbpmzlsuzaxnkbiupc</code>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
