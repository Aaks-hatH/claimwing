"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Download, Eye, RefreshCw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { ClaimView } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { formatLocal } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Alert, NotLegalAdvice, StatusBadge } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlays";

const FLOW = [
  { id: "draft", label: "Draft" },
  { id: "ready", label: "Ready" },
  { id: "sent", label: "Sent" },
  { id: "awaiting_reply", label: "Awaiting reply" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Rejected" },
] as const;

export function ClaimEditor({
  claim,
  manifest,
  aiEnabled,
  demo,
  placeholdersHint,
}: {
  claim: ClaimView;
  manifest: string[];
  aiEnabled: boolean;
  demo: boolean;
  placeholdersHint: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(claim.letterText);
  const [source, setSource] = useState(claim.letterSource);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<"pdf" | "zip" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previousText, setPreviousText] = useState<string | null>(null);
  const dirty = text !== claim.letterText;
  const placeholders = useMemo(() => [...new Set(text.match(/\[[A-Z][A-Z0-9 ,.'/-]*\]/g) ?? [])], [text]);
  void placeholdersHint;

  async function patch(body: Record<string, unknown>, label: string, success = "Saved") {
    setBusy(label);
    try {
      const res = await fetch(`/api/claims/${claim.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Couldn't save");
      toast.success(success);
      router.refresh();
      return b.claim as ClaimView;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  async function letter(mode: "template" | "polish") {
    setBusy(mode);
    try {
      const res = await fetch("/api/letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId: claim.id, mode, text }) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "Couldn't generate the letter");
      if (mode === "polish" && !b.changed) {
        toast.message(b.note ?? "No changes suggested.");
        return;
      }
      setPreviousText(text);
      setText(b.text);
      setSource(b.source);
      toast.success(mode === "polish" ? "Polished. Review it before saving; no facts were changed." : "Letter rebuilt from your latest facts.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function download(kind: "pdf" | "zip") {
    // Navigating to the endpoint lets the browser handle the download natively.
    const a = document.createElement("a");
    a.href = `/api/claims/${claim.id}/${kind}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(kind === "pdf" ? "Evidence packet generated. Check your downloads." : "Original files packaged with SHA-256 hashes. Check your downloads.");
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {demo && <Alert tone="warning" title="This claim uses a demo replay. Don't send it to an airline." />}
        <Card id="claim-letter" className="scroll-mt-28">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Claim letter</CardTitle>
              <CardDescription>Built only from the facts you recorded. Fill in anything in [BRACKETS] before sending.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => letter("template")} loading={busy === "template"}>
                {busy !== "template" && <RefreshCw />} Rebuild from facts
              </Button>
              {aiEnabled && (
                <Button size="sm" variant="outline" onClick={() => letter("polish")} loading={busy === "polish"}>
                  {busy !== "polish" && <Wand2 />} Polish wording (AI)
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {placeholders.length > 0 && (
              <Alert tone="warning" title={`${placeholders.length} thing${placeholders.length === 1 ? "" : "s"} to fill in`}>
                {placeholders.join(", ")}
              </Alert>
            )}
            <Label htmlFor="letter" className="sr-only">
              Letter text
            </Label>
            <Textarea id="letter" value={text} onChange={(e) => (setText(e.target.value), setSource("edited"))} rows={24} className="font-mono text-[13px] leading-relaxed" spellCheck />
            {source === "ai_polished" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden /> Wording polished by AI. Placeholders and numbers were checked to be unchanged.
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  toast.success("Letter copied");
                }}
              >
                <Copy /> Copy letter
              </Button>
              {previousText !== null && (
                <Button size="sm" variant="ghost" onClick={() => (setText(previousText), setPreviousText(null))}>
                  Undo
                </Button>
              )}
            </div>
            <Button onClick={() => patch({ letterText: text, letterSource: source }, "save", "Letter saved")} loading={busy === "save"} disabled={!dirty}>
              {busy !== "save" && <Save />} Save letter
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Export</CardTitle>
            <CardDescription>One PDF with everything, or a ZIP of your untouched original files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dirty && <p className="text-xs text-warning">Save the letter first so the export includes your edits.</p>}
            <Button className="w-full" variant="outline" asChild>
              <a href={`/api/claims/${claim.id}/pdf?preview=1`} target="_blank" rel="noopener" aria-disabled={dirty} onClick={(e) => dirty && e.preventDefault()}>
                <Eye /> Preview the PDF
              </a>
            </Button>
            <Button className="w-full" onClick={() => setExportKind("pdf")} disabled={dirty}>
              <Download /> Download evidence PDF
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setExportKind("zip")} disabled={dirty}>
              <Archive /> Download originals (ZIP)
            </Button>
            {claim.lastExportAt && <p className="text-xs text-muted-foreground">Last exported {formatLocal(claim.lastExportAt, null)}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Update this yourself as things happen. ClaimWing never sends anything to the airline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const recovered = String(f.get("recovered") ?? "").trim();
                patch(
                  {
                    status: f.get("status"),
                    statusNote: String(f.get("note") ?? "").trim() || undefined,
                    airlineReference: String(f.get("ref") ?? "").trim() || null,
                    recoveredAmount: recovered ? Number(recovered) : null,
                  },
                  "status",
                  "Status updated",
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <NativeSelect id="status" name="status" defaultValue={claim.status}>
                  {FLOW.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" name="note" placeholder="e.g. Sent via airline web form" maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref">Airline case reference</Label>
                <Input id="ref" name="ref" defaultValue={claim.airlineReference ?? ""} maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recovered">Amount received{claim.currency ? ` (${claim.currency})` : ""}</Label>
                <Input id="recovered" name="recovered" inputMode="decimal" defaultValue={claim.recoveredAmount ?? ""} />
              </div>
              <Button type="submit" variant="outline" className="w-full" loading={busy === "status"}>
                Update status
              </Button>
            </form>
            <ol className="space-y-2 border-t pt-4">
              {[...claim.timeline].reverse().map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-sm">
                  <span>
                    <StatusBadge status={e.status as ClaimView["status"]} />
                    {e.note && <span className="mt-1 block text-xs text-muted-foreground">{e.note}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatLocal(e.at, null, { withZone: false })}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {claim.eligibility?.primary && (
          <Card>
            <CardHeader>
              <CardTitle>Eligibility snapshot</CardTitle>
              <CardDescription>Taken when the claim started.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <StatusBadge status={claim.eligibility.primary.status} />
              <p>{claim.eligibility.summary}</p>
              {claim.amount && claim.currency && <p className="font-semibold">{formatMoney(claim.amount, claim.currency)}</p>}
              <Button size="sm" variant="ghost" onClick={() => patch({ refreshEligibility: true }, "refresh", "Eligibility refreshed")} loading={busy === "refresh"}>
                <RefreshCw /> Refresh from latest facts
              </Button>
            </CardContent>
          </Card>
        )}

        <Button variant="ghost" className="w-full text-danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Delete claim
        </Button>
        <NotLegalAdvice />
      </div>

      <ConfirmDialog
        open={exportKind !== null}
        onOpenChange={(o) => !o && setExportKind(null)}
        title={exportKind === "zip" ? "Download your original files?" : "Download the evidence PDF?"}
        description="The file is created on our server and downloaded to this device only. Check what it contains before you share it:"
        confirmLabel="Download"
        onConfirm={() => {
          if (exportKind) download(exportKind);
          setExportKind(null);
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {manifest.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {exportKind === "zip" && <li>Original photos exactly as uploaded, including any embedded location data, and an evidence.json file with SHA-256 hashes</li>}
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this claim?"
        description="The letter and status history are deleted. Your trip, photos and flight evidence stay."
        confirmLabel="Delete claim"
        destructive
        onConfirm={async () => {
          const res = await fetch(`/api/claims/${claim.id}`, { method: "DELETE" });
          if (!res.ok) return void toast.error("Couldn't delete the claim");
          router.push("/app/claims");
          router.refresh();
        }}
      />
    </div>
  );
}
