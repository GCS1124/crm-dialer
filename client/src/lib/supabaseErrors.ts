type SupabaseErrorLike = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export function isMissingSupabaseTableError(error: unknown) {
  const candidate = error as SupabaseErrorLike | null;
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  const code = typeof candidate?.code === "string" ? candidate.code.toUpperCase() : "";
  const status =
    typeof candidate?.status === "number"
      ? candidate.status
      : typeof candidate?.statusCode === "number"
        ? candidate.statusCode
        : null;

  return (
    status === 404 ||
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist|table .* does not exist/i.test(message)
  );
}
