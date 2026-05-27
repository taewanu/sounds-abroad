import { ChartFileSchema } from "@/lib/chart-schema";

import raw from "./charts.json";

export const CHARTS = ChartFileSchema.parse(raw);

export const CODE_KR = "kr";
export const CODE_US = "us";
export const CODE_BR = "br";

const kr = CHARTS.countries[CODE_KR];
const us = CHARTS.countries[CODE_US];
const br = CHARTS.countries[CODE_BR];

if (!kr || !us || !br) {
  throw new Error(
    "Test fixtures missing one of kr/us/br — update __fixtures__/charts.json",
  );
}

export const COUNTRY_KR = kr;
export const COUNTRY_US = us;
export const COUNTRY_BR = br;
