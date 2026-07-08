/** 论文状态徽章。 */
import type { PaperStatus } from "@/types";
import { PAPER_STATUS_META, cn } from "@/lib/utils";

export function PaperStatusBadge({ status }: { status: PaperStatus }) {
  const meta = PAPER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.color,
      )}
    >
      {meta.label}
    </span>
  );
}
