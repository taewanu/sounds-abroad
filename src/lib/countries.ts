export type Region = "Americas" | "Europe" | "Asia" | "Oceania" | "Africa";

export interface CountryEntry {
  code: string;
  name: string;
  region: Region;
}

export const COUNTRIES: readonly CountryEntry[] = [
  // Americas (8)
  { code: "us", name: "United States", region: "Americas" },
  { code: "ca", name: "Canada", region: "Americas" },
  { code: "mx", name: "Mexico", region: "Americas" },
  { code: "br", name: "Brazil", region: "Americas" },
  { code: "ar", name: "Argentina", region: "Americas" },
  { code: "cl", name: "Chile", region: "Americas" },
  { code: "co", name: "Colombia", region: "Americas" },
  { code: "pe", name: "Peru", region: "Americas" },

  // Europe (14)
  { code: "gb", name: "United Kingdom", region: "Europe" },
  { code: "fr", name: "France", region: "Europe" },
  { code: "de", name: "Germany", region: "Europe" },
  { code: "es", name: "Spain", region: "Europe" },
  { code: "it", name: "Italy", region: "Europe" },
  { code: "nl", name: "Netherlands", region: "Europe" },
  { code: "se", name: "Sweden", region: "Europe" },
  { code: "no", name: "Norway", region: "Europe" },
  { code: "dk", name: "Denmark", region: "Europe" },
  { code: "fi", name: "Finland", region: "Europe" },
  { code: "ie", name: "Ireland", region: "Europe" },
  { code: "pt", name: "Portugal", region: "Europe" },
  { code: "pl", name: "Poland", region: "Europe" },
  { code: "tr", name: "Turkey", region: "Europe" },

  // Asia (14)
  { code: "jp", name: "Japan", region: "Asia" },
  { code: "kr", name: "South Korea", region: "Asia" },
  { code: "tw", name: "Taiwan", region: "Asia" },
  { code: "hk", name: "Hong Kong", region: "Asia" },
  { code: "sg", name: "Singapore", region: "Asia" },
  { code: "th", name: "Thailand", region: "Asia" },
  { code: "id", name: "Indonesia", region: "Asia" },
  { code: "vn", name: "Vietnam", region: "Asia" },
  { code: "ph", name: "Philippines", region: "Asia" },
  { code: "my", name: "Malaysia", region: "Asia" },
  { code: "in", name: "India", region: "Asia" },
  { code: "ae", name: "United Arab Emirates", region: "Asia" },
  { code: "sa", name: "Saudi Arabia", region: "Asia" },
  { code: "il", name: "Israel", region: "Asia" },

  // Oceania (2)
  { code: "au", name: "Australia", region: "Oceania" },
  { code: "nz", name: "New Zealand", region: "Oceania" },

  // Africa (2)
  { code: "za", name: "South Africa", region: "Africa" },
  { code: "ng", name: "Nigeria", region: "Africa" },
];
