import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "21–40 of 1,284 · ‹ Page 2 of 65 ›" under any paginated list.
 * Renders nothing when everything fits on one page, unless `always`.
 */
export default function Pager({ page, onChange, noun = "items", always = false, className = "" }: {
  page: { current_page: number; last_page: number; total: number; from?: number | null; to?: number | null } | null | undefined;
  onChange: (page: number) => void;
  noun?: string;
  always?: boolean;
  className?: string;
}) {
  if (!page || (!always && page.last_page <= 1)) return null;

  const { current_page: n, last_page: last, total, from, to } = page;
  const range = from && to ? `${from.toLocaleString()}–${to.toLocaleString()} of ` : "";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground ${className}`}>
      <span className="tabular-nums">{range}{total.toLocaleString()} {noun}</span>
      {last > 1 && (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={n <= 1} onClick={() => onChange(1)} aria-label="First page">«</Button>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={n <= 1} onClick={() => onChange(n - 1)} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2 tabular-nums">Page {n.toLocaleString()} of {last.toLocaleString()}</span>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={n >= last} onClick={() => onChange(n + 1)} aria-label="Next page">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 px-2" disabled={n >= last} onClick={() => onChange(last)} aria-label="Last page">»</Button>
        </div>
      )}
    </div>
  );
}
