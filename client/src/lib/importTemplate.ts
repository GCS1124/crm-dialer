export const LEAD_IMPORT_TEMPLATE_NAME = "crm-dialer-leads-import-template.xlsx";

export const LEAD_IMPORT_TEMPLATE_URL = `/templates/${LEAD_IMPORT_TEMPLATE_NAME}`;

export const LEAD_IMPORT_TEMPLATE_STEPS = [
  "Download the default Excel template.",
  "Fill the Leads sheet with one contact per row.",
  "Keep each phone number in its own field so numbers are never merged.",
  "Leave the Lists sheet in place for the allowed status and priority values.",
  "Upload the finished workbook from Lead Management or the dialer.",
] as const;
