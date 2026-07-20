import { putJson } from "../lib/object-store";

import { DROPS_PATHNAME, type DropsStore } from "./drops";

export async function uploadDrops(drops: DropsStore): Promise<string> {
  return putJson(DROPS_PATHNAME, JSON.stringify(drops, null, 2));
}
