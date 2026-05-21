import { ChartFileSchema } from "@/lib/chart-schema";

import raw from "./charts.json";

export const CHARTS = ChartFileSchema.parse(raw);

const kr = CHARTS.countries.kr;
const us = CHARTS.countries.us;
const br = CHARTS.countries.br;

if (!kr || !us || !br) {
  throw new Error(
    "Test fixtures missing one of kr/us/br — update __fixtures__/charts.json",
  );
}

export const COUNTRY_KR = kr;
export const COUNTRY_US = us;
export const COUNTRY_BR = br;

export const TRACK_KR_1 = kr.tracks[0];
