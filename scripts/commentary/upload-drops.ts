import { put } from "@vercel/blob";

import { DROPS_PATHNAME, type DropsStore } from "./drops";

export async function uploadDrops(drops: DropsStore): Promise<string> {
  const body = JSON.stringify(drops, null, 2);
  const result = await put(DROPS_PATHNAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}
