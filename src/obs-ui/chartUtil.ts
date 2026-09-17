// Truncate long chart category labels to N chars (full text still shows on hover tooltip / click).
export const axisTrunc = (n = 15) => (v: any) =>
  typeof v === "string" && v.length > n ? v.slice(0, n) + "…" : v;
