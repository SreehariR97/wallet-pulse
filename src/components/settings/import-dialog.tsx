"use client";
import * as React from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TargetField {
  key: string;
  label: string;
  required?: boolean;
}

const TARGET_FIELDS: TargetField[] = [
  { key: "date", label: "Date (required)", required: true },
  { key: "type", label: "Type (expense/income)" },
  { key: "amount", label: "Amount (required)", required: true },
  { key: "category", label: "Category" },
  { key: "description", label: "Description" },
  { key: "notes", label: "Notes" },
  { key: "paymentMethod", label: "Payment method" },
  { key: "tags", label: "Tags" },
];

const SKIP = "__skip__";

function guessMapping(header: string): string | null {
  const h = header.toLowerCase().trim();
  if (/date|when|posted/.test(h)) return "date";
  if (/type|direction/.test(h)) return "type";
  if (/amount|value|total|sum|debit|credit/.test(h)) return "amount";
  if (/category|cat\b/.test(h)) return "category";
  if (/desc|memo|name|payee/.test(h)) return "description";
  if (/notes?/.test(h)) return "notes";
  if (/payment|method|source|account/.test(h)) return "paymentMethod";
  if (/tags?/.test(h)) return "tags";
  return null;
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setHeaders([]);
      setPreview([]);
      setMapping({});
    }
  }, [open]);

  async function onFile(f: File) {
    setFile(f);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      preview: 5,
      complete: (res) => {
        const fields = res.meta.fields ?? [];
        setHeaders(fields);
        setPreview(res.data.slice(0, 5));
        const initial: Record<string, string> = {};
        fields.forEach((h) => {
          const guess = guessMapping(h);
          if (guess) initial[h] = guess;
        });
        setMapping(initial);
      },
    });
  }

  async function doImport() {
    if (!file) return;
    setPending(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data.map((row) => {
          const out: Record<string, unknown> = {};
          for (const [src, target] of Object.entries(mapping)) {
            if (!target || target === SKIP) continue;
            out[target] = row[src];
          }
          return out;
        });
        const apiRes = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        });
        setPending(false);
        if (!apiRes.ok) {
          const j = await apiRes.json().catch(() => ({}));
          return toast.error(j.error ?? "Import failed");
        }
        const { data } = await apiRes.json();
        toast.success(`Imported ${data.imported} transactions${data.skipped ? ` (${data.skipped} skipped)` : ""}`);
        onOpenChange(false);
      },
    });
  }

  const requiredMet = TARGET_FIELDS.filter((f) => f.required).every((f) =>
    Object.values(mapping).includes(f.key)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import transactions from CSV</DialogTitle>
          <DialogDescription>
            Select a CSV file, then map its columns to WalletPulse fields. Categories are matched by name; unknown categories fall back to Miscellaneous.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border/60 bg-card/30 p-10">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <Label htmlFor="csv-file" className="cursor-pointer text-sm font-medium text-primary hover:underline">
              Choose CSV file
            </Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <p className="text-xs text-muted-foreground">Max 5,000 rows</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border/50 bg-card/30 px-3 py-2 text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground"> · {headers.length} columns · {preview.length}+ rows</span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Map columns</Label>
              <div className="grid gap-2">
                {headers.map((h) => (
                  <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="truncate rounded-md bg-muted/50 px-3 py-2 text-sm">{h}</div>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Select value={mapping[h] ?? SKIP} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Skip column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>Skip column</SelectItem>
                        {TARGET_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {!requiredMet && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Map both <span className="font-semibold">Date</span> and <span className="font-semibold">Amount</span> to continue.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={doImport} disabled={!file || !requiredMet || pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
