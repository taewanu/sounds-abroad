export async function triggerRevalidate(): Promise<void> {
  console.log(
    "[crawl] revalidate trigger: no-op (Issue #7 will wire to /api/revalidate)",
  );
}
