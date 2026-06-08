import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

import { countryByCode, validateCountryCode } from "@/lib/country-code";

export const runtime = "nodejs";

// Brand tokens (mirrors src/app/globals.css; inlined because next/og can't read CSS variables).
const VOID = "#050608";
const FG1 = "#f5f2ec";
const FG2 = "#b8b5ae";
const FG3 = "#6e6b66";
const SUNRISE = "#ff6b47";

const BACKGROUND =
  "radial-gradient(ellipse 90% 90% at 72% 20%, rgba(20,23,32,0.35) 0%, rgba(20,23,32,0) 55%)," +
  "radial-gradient(ellipse 130% 120% at 50% 118%, #11131b 0%, #0a0b10 42%, #050608 100%)";

// Eyebrow: uppercase, tracked, one uniform dim color (code + dot + label all match).
function eyebrowStyle(fontSize: number) {
  return {
    fontFamily: "Poppins",
    fontWeight: 500,
    fontSize,
    letterSpacing: fontSize * 0.16,
    color: FG3,
  } as const;
}

// The flat-globe mark is inlined here as JSX rather than loaded from
// public/logo-mark-flat.svg: next/og can only recolor and resize the mark when
// it is written as inline SVG elements, and each card needs it in a different
// color and size. The same shape also lives in public/logo-mark-flat.svg and
// src/app/icon.svg (favicon); if the geometry or the sunrise pin changes, update
// those copies too.

// Small wordmark glyph: simplified flat globe, brighter (fg-2).
function WordmarkGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle
        cx="32"
        cy="32"
        r="24"
        stroke={FG2}
        strokeWidth="1.6"
        opacity="0.7"
      />
      <line
        x1="8"
        y1="32"
        x2="56"
        y2="32"
        stroke={FG2}
        strokeWidth="1.4"
        opacity="0.5"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="7.4"
        ry="24"
        stroke={FG2}
        strokeWidth="1.4"
        opacity="0.3"
      />
      <circle cx="46.3" cy="23" r="4.5" fill={SUNRISE} />
    </svg>
  );
}

// Full flat-globe motif: circle + 3 lat lines + 2 lon ellipses + sunrise pin.
function GlobeMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle
        cx="32"
        cy="32"
        r="24"
        stroke={color}
        strokeWidth="1"
        opacity="0.7"
      />
      <line
        x1="9.751"
        y1="23"
        x2="54.249"
        y2="23"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.24"
      />
      <line
        x1="8"
        y1="32"
        x2="56"
        y2="32"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.5"
      />
      <line
        x1="9.751"
        y1="41"
        x2="54.249"
        y2="41"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.24"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="17.836"
        ry="24"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.32"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="7.416"
        ry="24"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.22"
      />
      <circle cx="46.3" cy="23" r="7" fill={SUNRISE} opacity="0.22" />
      <circle cx="46.3" cy="23" r="3.4" fill={SUNRISE} />
    </svg>
  );
}

function Wordmark({ glyph, text }: { glyph: number; text: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: glyph * 0.46 }}>
      <WordmarkGlyph size={glyph} />
      <div
        style={{
          fontFamily: "Poppins",
          fontWeight: 500,
          fontSize: text,
          letterSpacing: text * 0.14,
          color: FG2,
        }}
      >
        SOUNDS ABROAD
      </div>
    </div>
  );
}

function CountryName({
  lines,
  fontSize,
}: {
  lines: string[];
  fontSize: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: "Instrument Serif",
            fontStyle: "italic",
            fontSize,
            lineHeight: 0.95,
            color: FG1,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function Footer({ fontSize }: { fontSize: number }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Poppins",
        fontWeight: 500,
        fontSize,
      }}
    >
      <div style={{ color: FG3 }}>Charts from&nbsp;</div>
      <div style={{ color: FG2 }}>Apple Music</div>
      <div style={{ color: FG3 }}>, updated daily</div>
    </div>
  );
}

function Landscape({
  nameLines,
  eyebrow,
  nameSize,
}: {
  nameLines: string[];
  eyebrow: string;
  nameSize: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "78px 80px",
        backgroundColor: VOID,
        backgroundImage: BACKGROUND,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -150,
          display: "flex",
          opacity: 0.55,
        }}
      >
        <GlobeMark size={660} color={FG3} />
      </div>
      <Wordmark glyph={30} text={24} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
        }}
      >
        <div style={{ ...eyebrowStyle(28), marginBottom: 14 }}>{eyebrow}</div>
        <CountryName lines={nameLines} fontSize={nameSize} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            width: 96,
            height: 4,
            backgroundColor: SUNRISE,
            borderRadius: 4,
          }}
        />
        <Footer fontSize={22} />
      </div>
    </div>
  );
}

function Square({
  nameLines,
  eyebrow,
  nameSize,
}: {
  nameLines: string[];
  eyebrow: string;
  nameSize: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        textAlign: "center",
        width: "100%",
        height: "100%",
        padding: "56px 84px",
        backgroundColor: VOID,
        backgroundImage: BACKGROUND,
        overflow: "hidden",
      }}
    >
      <Wordmark glyph={44} text={30} />
      <div style={{ display: "flex", opacity: 0.55 }}>
        <GlobeMark size={480} color={FG3} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          marginTop: -84,
        }}
      >
        <CountryName lines={nameLines} fontSize={nameSize} />
        <div style={eyebrowStyle(30)}>{eyebrow}</div>
      </div>
      <Footer fontSize={24} />
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = validateCountryCode(searchParams.get("cc"));
  const entry = code ? countryByCode(code) : undefined;
  const square = searchParams.get("shape") === "square";

  const nameLines = entry ? [entry.name] : ["What the world", "is playing"];
  const eyebrow = entry
    ? `${entry.code.toUpperCase()} · TOP 25`
    : "TRENDING WORLDWIDE";
  const nameSize = entry ? (square ? 170 : 150) : square ? 112 : 104;

  const [poppins, instrument] = await Promise.all([
    readFile(new URL("../fonts/Poppins-Medium.ttf", import.meta.url)),
    readFile(new URL("../fonts/InstrumentSerif-Italic.ttf", import.meta.url)),
  ]);

  const element = square ? (
    <Square nameLines={nameLines} eyebrow={eyebrow} nameSize={nameSize} />
  ) : (
    <Landscape nameLines={nameLines} eyebrow={eyebrow} nameSize={nameSize} />
  );

  return new ImageResponse(element, {
    width: 1200,
    height: square ? 1200 : 630,
    fonts: [
      { name: "Poppins", data: poppins, weight: 500, style: "normal" },
      {
        name: "Instrument Serif",
        data: instrument,
        weight: 400,
        style: "italic",
      },
    ],
  });
}
