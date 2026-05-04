import { Download } from "lucide-react";

import { LEAD_IMPORT_TEMPLATE_URL, LEAD_IMPORT_TEMPLATE_STEPS } from "../../lib/importTemplate";
import { cn } from "../../lib/utils";

interface ImportTemplateCardProps {
  compact?: boolean;
  className?: string;
}

export function ImportTemplateCard({ compact = false, className }: ImportTemplateCardProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
            Default upload template
          </h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-6 text-slate-500 dark:text-slate-400">
            Use the bundled workbook to keep the upload layout consistent with the lead importer.
          </p> 
        </div>
        <div className="rounded-full bg-sky-50 p-2 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
          <Download size={18} />
        </div>
      </div>

      <a
        href={LEAD_IMPORT_TEMPLATE_URL}
        download
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#1d6ea1] bg-[#1f7db3] px-4 py-2.5 text-[12px] font-medium text-white shadow-[0_10px_24px_rgba(31,125,179,0.22)] transition hover:bg-[#186791] dark:border-[#2787bd] dark:bg-[#2787bd] dark:hover:bg-[#2d91c9]"
      >
        <Download size={14} />
        Download Excel template
      </a>

      {compact ? (
        <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Download the template first, then upload the completed file.
        </p>
      ) : (
        <ol className="mt-4 grid gap-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          {LEAD_IMPORT_TEMPLATE_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
                {index + 1}
              </span>
              <span className="leading-5">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
