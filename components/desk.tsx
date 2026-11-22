"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Leaf, Moon, RotateCcw, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Trace = { name: string; ok: boolean; summary: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  traces?: Trace[];
  pendingActionIds?: string[];
};
type EventItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string;
  notes: string;
};
type TaskItem = {
  id: string;
  title: string;
  details: string;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  due: string | null;
};
type NoteItem = { id: string; title: string; body: string; tags: string[] };
type MemoryItem = { id: string; kind: string; text: string };
type ActionItem = {
  id: string;
  channel: "email" | "webhook";
  to: string;
  subject: string;
  body: string;
  reason: string;
  status: "pending" | "sent" | "rejected";
  delivery: "simulated" | "webhook" | null;
  deliveryDetail: string | null;
};
type AssessmentItem = {
  id: string;
  title: string;
  fitScore: number;
  fitBand: "strong" | "partial" | "poor";
  rateOk: boolean;
  scam: boolean;
  summary: string;
  redFlags: string[];
  citations: { sourceId: string; label: string; quote: string }[];
  webVerified: boolean;
};
type ReviewItem = { id: string; reason: string; status: string };
type JobItem = { id: string; title: string; company: string; hourly: number | null; budget: number | null; shortlist: boolean };
type DeskView = {
  meta: {
    provider: string;
    model: string;
    timeZone: string;
    today: string;
    demoUi: boolean;
    outboundConfigured: boolean;
    schedulerEnabled: boolean;
  };
  events: EventItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
  memories: MemoryItem[];
  actions: ActionItem[];
  messages: Message[];
  assessments: AssessmentItem[];
  reviewQueue: ReviewItem[];
  jobs: JobItem[];
};

const PROMPTS = [
  "What's on my plate today?",
  "Block 90 minutes tomorrow morning for the harbor ledger case study and add a task to draft the case-study notes.",
  "Remember that I protect Friday afternoons for writing.",
  "Assess the shortlist and prep the best one.",
];

export function Desk() {
  const [view, setView] = useState<DeskView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch("/api/state");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The desk didn't load.");
    setView(body);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/state")
      .then(async (response) => {
        const body = (await response.json()) as DeskView & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "The desk didn't load.");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setView(body);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "The desk didn't load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [view?.messages.length, busy]);

  async function run(label: string, path: string, init?: RequestInit) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(path, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "That didn't work.");
      setView(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    await run("Reading the desk…", "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  }

  const timeZone = view?.meta.timeZone ?? "Asia/Manila";
  const todayEvents = (view?.events ?? []).filter((event) => localDate(event.start, timeZone) === view?.meta.today);
  const laterEvents = (view?.events ?? []).filter((event) => localDate(event.start, timeZone) !== view?.meta.today);
  const openTasks = (view?.tasks ?? []).filter((task) => task.status === "open");
  const pending = (view?.actions ?? []).filter((action) => action.status === "pending");
  const highlight = [...(view?.assessments ?? [])].sort((a, b) => {
    if (a.scam !== b.scam) return a.scam ? 1 : -1;
    if (a.rateOk !== b.rateOk) return a.rateOk ? -1 : 1;
    return b.fitScore - a.fitScore;
  })[0];

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_55%)]">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground uppercase">
              <Leaf className="size-3.5 text-primary" aria-hidden />
              Local agentic desk
            </p>
            <h1 className="font-heading text-4xl tracking-tight text-foreground sm:text-5xl">Canopy</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Desk for Mara Ellison, a fictional freelance automation consultant. It scores synthetic posts and parks
              every draft until you confirm.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {view ? `${view.meta.provider} · ${view.meta.model}` : "starting"}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDark((value) => !value)}
              aria-pressed={dark}
            >
              {dark ? <Sun /> : <Moon />}
              {dark ? "Day" : "Night"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="assess-shortlist"
              disabled={Boolean(busy)}
              onClick={() => send("Assess the shortlist and prep the best one.")}
            >
              Assess shortlist
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="morning-brief"
              disabled={Boolean(busy) || !view?.meta.demoUi}
              onClick={() => run("Writing the morning brief…", "/api/desk/brief?force=1", { method: "POST" })}
            >
              Morning brief
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="sample-inquiry"
              disabled={Boolean(busy) || !view?.meta.demoUi}
              onClick={() => run("Parking the inquiry…", "/api/desk/inquiry", { method: "POST" })}
            >
              Studio inquiry
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResetOpen(true)} disabled={Boolean(busy)}>
              <RotateCcw />
              Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1.35fr)_22rem]">
        <section className="flex min-h-[70dvh] flex-col rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="font-heading text-lg">Desk conversation</h2>
            <p className="text-xs text-muted-foreground">{busy ?? "Tools show up under each reply."}</p>
          </div>
          <Separator />
          <div ref={threadRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" data-testid="message-list">
            {loading && <Skeleton />}
            {!loading && error && !view && (
              <EmptyError message={error} onRetry={() => load().catch(() => undefined)} />
            )}
            {view && view.messages.length === 0 && (
              <div className="rounded-xl bg-muted/60 px-4 py-5">
                <p className="font-heading text-xl">The week is already on the desk.</p>
                <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                  Ask for the day, add a block and a task in one sentence, or park a reply. Nothing is emailed until
                  you confirm it.
                </p>
              </div>
            )}
            {view?.messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-8" : "mr-4"}>
                <p className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                  {message.role === "user" ? "You" : "Canopy"}
                  {message.intent ? ` · ${message.intent}` : ""}
                </p>
                <div
                  className={
                    message.role === "user"
                      ? "rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                  }
                >
                  {message.content}
                </div>
                {message.traces && message.traces.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {message.traces.map((trace, index) => (
                      <li key={`${message.id}-${index}`}>
                        <Badge variant={trace.ok ? "outline" : "destructive"}>
                          {trace.name} · {trace.summary}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
          {error && view && (
            <p className="px-4 pb-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="px-4 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={Boolean(busy)}
                  onClick={() => send(prompt)}
                >
                  {prompt.length > 42 ? `${prompt.slice(0, 40)}…` : prompt}
                </Button>
              ))}
            </div>
          </div>
          <form
            className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="desk-message">
              Message the desk
            </label>
            <Textarea
              id="desk-message"
              data-testid="chat-input"
              value={draft}
              placeholder="Ask about today, or tell the desk what to change."
              className="min-h-16 sm:min-h-12"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <Button type="submit" data-testid="send-button" disabled={Boolean(busy) || !draft.trim()} className="sm:self-end">
              Send
            </Button>
          </form>
        </section>

        <aside className="space-y-4">
          <Card data-testid="assessments">
            <CardHeader>
              <CardTitle>Fit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(view?.jobs ?? [])
                .filter((job) => job.shortlist)
                .map((job) => {
                  const scored = view?.assessments.find((item) => item.title === job.title);
                  return (
                    <div key={job.id}>
                      <p className="text-sm font-medium">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.company}
                        {job.hourly != null ? ` · ${job.hourly} USD/h` : ""}
                        {job.budget != null ? ` · ${job.budget} USD fixed` : ""}
                        {scored ? ` · ${scored.fitBand} ${scored.fitScore}` : " · not scored"}
                        {scored?.scam ? " · scam checklist" : ""}
                        {scored && !scored.rateOk ? " · below floor" : ""}
                      </p>
                    </div>
                  );
                })}
              {highlight && (
                <div className="rounded-xl bg-muted/70 p-3 text-sm">
                  <p>{highlight.summary}</p>
                  {highlight.citations[0] && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Cited {highlight.citations[0].label}: {highlight.citations[0].quote}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {highlight.webVerified ? "Company snippet is a fixture, not a live fetch." : "Not web-verified."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="review-queue">
            <CardHeader>
              <CardTitle>Review queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(view?.reviewQueue ?? []).filter((item) => item.status === "open").length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Off-schema model output lands here after one repair. Nothing is guessed.
                </p>
              )}
              {(view?.reviewQueue ?? [])
                .filter((item) => item.status === "open")
                .map((item) => (
                  <p key={item.id} className="text-sm">
                    {item.reason}
                  </p>
                ))}
            </CardContent>
          </Card>
          <Card data-testid="pending-list">
            <CardHeader>
              <CardTitle>Pending confirmation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!view && (
                <p className="text-sm text-muted-foreground">Loading drafts…</p>
              )}
              {view && pending.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No outbound drafts. Emails and webhooks land here and wait.
                </p>
              )}
              {pending.map((action) => (
                <div key={action.id} className="rounded-xl bg-accent/50 p-3 ring-1 ring-primary/20">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {action.channel} · not sent
                  </p>
                  <p className="mt-1 font-medium">{action.subject}</p>
                  <p className="text-xs text-muted-foreground">To {action.to}</p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{action.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{action.reason}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`confirm-${action.id}`}
                      disabled={Boolean(busy)}
                      onClick={() => run("Confirming…", `/api/actions/${action.id}/confirm`, { method: "POST" })}
                    >
                      <Check />
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`reject-${action.id}`}
                      disabled={Boolean(busy)}
                      onClick={() => run("Rejecting…", `/api/actions/${action.id}/reject`, { method: "POST" })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {(view?.actions ?? [])
                .filter((action) => action.status !== "pending")
                .slice(0, 2)
                .map((action) => (
                  <p key={action.id} className="text-xs text-muted-foreground">
                    {action.subject}: {action.deliveryDetail}
                  </p>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!view && <p className="text-sm text-muted-foreground">Loading the day…</p>}
              {view && todayEvents.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing booked today.</p>
              )}
              {todayEvents.map((event) => (
                <EventRow key={event.id} event={event} timeZone={timeZone} />
              ))}
              {laterEvents.length > 0 && (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">Later</p>
                  {laterEvents.map((event) => (
                    <EventRow key={event.id} event={event} timeZone={timeZone} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!view && <p className="text-sm text-muted-foreground">Loading tasks…</p>}
              {view && openTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No open tasks.</p>
              )}
              {openTasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.priority}
                      {task.due ? ` · due ${task.due}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => run("Updating the task…", `/api/tasks/${task.id}/complete`, { method: "POST" })}
                  >
                    Done
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Memory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!view && <p className="text-sm text-muted-foreground">Loading memory…</p>}
              {(view?.memories ?? []).map((memory) => (
                <p key={memory.id} className="text-sm">
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">{memory.kind}. </span>
                  {memory.text}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!view && <p className="text-sm text-muted-foreground">Loading notes…</p>}
              {(view?.notes ?? []).map((note) => (
                <div key={note.id}>
                  <p className="text-sm font-medium">{note.title}</p>
                  <p className="text-sm text-muted-foreground">{note.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
        Fictional data only. Canopy is a portfolio project by Charlene Cordero. Confirmed email is simulated unless you
        set an outbound webhook. {view?.meta.outboundConfigured ? "A webhook URL is configured." : "No webhook URL is set."}{" "}
        {view?.meta.schedulerEnabled ? "The morning scheduler is on." : "The morning scheduler is off until you enable it."}
      </footer>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset the sample week?</DialogTitle>
            <DialogDescription>
              This replaces the chat, drafts, and any changes with the original Quezon City week. It does not touch a
              real calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              Keep working
            </Button>
            <Button
              type="button"
              data-testid="confirm-reset"
              onClick={() => {
                setResetOpen(false);
                void run("Resetting the sample week…", "/api/desk/reset", { method: "POST" });
              }}
            >
              Reset demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventRow({ event, timeZone }: { event: EventItem; timeZone: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{event.title}</p>
      <p className="text-xs text-muted-foreground">
        {localDate(event.start, timeZone)} · {clock(event.start, timeZone)}–{clock(event.end, timeZone)}
        {event.location ? ` · ${event.location}` : ""}
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

function EmptyError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-destructive/10 px-4 py-4 text-sm" role="alert">
      <p>{message}</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}
