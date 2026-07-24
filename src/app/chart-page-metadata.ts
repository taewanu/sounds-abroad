import type { Metadata } from "next";

// One share-card shape for every chart route; the routes differ only in copy
// and in which /og variant the card points at.
export function chartPageMetadata({
  title,
  description,
  ogQuery = "",
}: {
  title: string;
  description: string;
  ogQuery?: string;
}): Metadata {
  const landscape = `/og${ogQuery}`;
  const squareSep = ogQuery ? "&" : "?";
  const square = `/og${ogQuery}${squareSep}shape=square`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [
        { url: landscape, width: 1200, height: 630 },
        { url: square, width: 1200, height: 1200 },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [landscape],
    },
  };
}
