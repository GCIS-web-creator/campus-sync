import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_PATH = join(ROOT, "weather_icons (2).zip");
const OUTPUT_DIR = join(ROOT, "public", "weather-icons");

const ICON_NAMES = [
  "sunny", "cloudy", "rain", "thunderstorm", "snow", "hail", "wind",
  "temperature", "humidity", "umbrella", "arrow", "partly_cloudy",
  "night_clear", "night_cloudy", "fog", "haze", "sleet", "rain_light",
  "rain_heavy", "shower", "lightning", "typhoon", "tornado", "kosa",
  "pm25", "sandstorm", "precip_probability", "pressure", "uv",
  "visibility", "feels_like", "sunrise", "sunset", "moon_new",
  "moon_waxing_crescent", "moon_first_quarter", "moon_waxing_gibbous",
  "moon_full", "moon_waning_gibbous", "moon_last_quarter",
  "moon_waning_crescent", "advisory", "warning", "special_warning",
  "pollen", "heatstroke_alert", "temp_high", "temp_low",
];

function extractSvgEntries(zip) {
  let endOffset = -1;
  const searchStart = Math.max(0, zip.length - 65_557);

  for (let offset = zip.length - 22; offset >= searchStart; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error("ZIP central directory was not found.");
  }

  const entryCount = zip.readUInt16LE(endOffset + 10);
  let cursor = zip.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("ZIP central directory is invalid.");
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);
    const fileName = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (fileName.endsWith(".svg") && !fileName.includes("/") && !fileName.includes(String.fromCharCode(92))) {
      if (localHeaderOffset + 30 > zip.length || zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("ZIP local header is invalid for " + fileName + ".");
      }

      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);

      let content;
      if (method === 0) {
        content = Buffer.from(compressed);
      } else if (method === 8) {
        content = inflateRawSync(compressed);
      } else {
        throw new Error("Unsupported ZIP compression method " + method + " for " + fileName + ".");
      }

      entries.set(fileName, content);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function main() {
  const archive = await readFile(ARCHIVE_PATH);
  const svgEntries = extractSvgEntries(archive);
  const missing = ICON_NAMES.filter((name) => !svgEntries.has(name + ".svg"));

  if (missing.length > 0) {
    throw new Error("Weather icon archive is missing: " + missing.join(", "));
  }

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const name of ICON_NAMES) {
    const svg = svgEntries.get(name + ".svg");
    await writeFile(join(OUTPUT_DIR, name + ".svg"), svg);

    const png = await sharp(svg, { density: 144 })
      .resize(256, 256, { fit: "contain" })
      .png()
      .toBuffer();
    await writeFile(join(OUTPUT_DIR, name + ".png"), png);
  }

  console.log("Generated " + ICON_NAMES.length + " weather SVG/PNG pairs in public/weather-icons/.");
}

main().catch((error) => {
  console.error("Weather icon generation failed:", error);
  process.exitCode = 1;
});
