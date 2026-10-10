import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        info: "border-transparent bg-info-soft text-accent-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type StatusKey =
  | "on_time"
  | "delayed"
  | "eligible"
  | "not_eligible"
  | "needs_review"
  | "filed"
  | "scheduled"
  | "in_air"
  | "landed"
  | "cancelled"
  | "diverted"
  | "unknown"
  | "draft"
  | "ready"
  | "sent"
  | "awaiting_reply"
  | "paid"
  | "rejected"
  | "documented"
  | "arrived_damaged"
  | "bag_delayed"
  | "lost"
  | "received_ok";

const STATUS: Record<StatusKey, { label: string; tone: VariantProps<typeof badgeVariants>["tone"] }> = {
  on_time: { label: "On time", tone: "success" },
  delayed: { label: "Delayed", tone: "warning" },
  eligible: { label: "Eligible", tone: "success" },
  not_eligible: { label: "Not eligible", tone: "neutral" },
  needs_review: { label: "Needs review", tone: "warning" },
  filed: { label: "Filed", tone: "info" },
  scheduled: { label: "Scheduled", tone: "neutral" },
  in_air: { label: "In the air", tone: "info" },
  landed: { label: "Landed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  diverted: { label: "Diverted", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "Ready", tone: "info" },
  sent: { label: "Filed", tone: "info" },
  awaiting_reply: { label: "Awaiting reply", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  documented: { label: "Documented", tone: "neutral" },
  arrived_damaged: { label: "Arrived damaged", tone: "danger" },
  bag_delayed: { label: "Delayed", tone: "warning" },
  lost: { label: "Lost", tone: "danger" },
  received_ok: { label: "Received OK", tone: "success" },
};

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}

const alertTones: Record<string, { cls: string; icon: LucideIcon }> = {
  info: { cls: "border-border bg-muted/50", icon: Info },
  success: { cls: "border-success/30 bg-success-soft", icon: CheckCircle2 },
  warning: { cls: "border-warning/30 bg-warning-soft", icon: AlertTriangle },
  danger: { cls: "border-danger/30 bg-danger-soft", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  icon,
  action,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  const t = alertTones[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4 text-sm", t.cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground [&_a]:underline">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function NotLegalAdvice({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      ClaimWing helps you document facts. It is not legal advice, and eligibility results are estimates, not guarantees.
    </p>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-danger" role="alert">
      {message}
    </p>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DefinitionList({ items, className }: { items: Array<[React.ReactNode, React.ReactNode]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2.5 text-sm", className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
