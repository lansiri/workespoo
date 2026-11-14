// Joins the clips made by e2e/record-demo.mjs into one silent film with captions burned in.
//
//   node e2e/make-video.mjs out/demo-video out/workespoo-demo.mp4
//
// Needs ffmpeg with libx264 and drawtext. FONT_FILE picks the caption font (default: Noto Sans,
// then DejaVu Sans). Each caption is shown during the seconds captions.json gives it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dirArg, outArg] = process.argv.slice(2);
if (!dirArg || !outArg) {
  console.error("usage: node e2e/make-video.mjs <folder with clips and captions.json> <output.mp4>");
  process.exit(2);
}
const dir = path.resolve(dirArg);
const output = path.resolve(outArg);
const work = path.join(dir, "work");
mkdirSync(work, { recursive: true });

const FONT =
  process.env.FONT_FILE ??
  ["/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => existsSync(f));
if (!FONT) {
  console.error("no caption font found: set FONT_FILE to a .ttf file");
  process.exit(2);
}

const captions = JSON.parse(readFileSync(path.join(dir, "captions.json"), "utf8"));
const clips = readdirSync(dir).filter((f) => /^\d\d-.*\.webm$/.test(f)).sort();
if (clips.length === 0) throw new Error(`no clips in ${dir}`);

/** Break a caption into lines of at most `width` characters, at spaces. */
function wrap(text, width = 78) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

const BAR = 92; // height of the caption bar added under each clip: 1600x808 becomes a 1600x900 film
const parts = [];
clips.forEach((clipFile, index) => {
  const mine = captions.filter((c) => c.clip === clipFile);
  // The bar goes under the page, not over it: nothing on the screen is hidden by a caption.
  const filters = [`pad=iw:ih+${BAR}:0:0:color=0x10362F`];
  mine.forEach((c, n) => {
    const textFile = path.join(work, `${index}-${n}.txt`);
    const wrapped = wrap(c.text);
    writeFileSync(textFile, wrapped);
    const lines = wrapped.split("\n").length;
    const y = lines > 1 ? `h-${BAR}+12` : `h-${BAR}+30`;
    // The type grows with the frame: 23 px at 1280 wide, 29 px at 1600; two lines fit the bar.
    filters.push(
      `drawtext=fontfile='${FONT}':textfile='${textFile}':fontcolor=white:fontsize=w/56:line_spacing=6:x=(w-text_w)/2:y=${y}:enable='between(t,${c.from.toFixed(2)},${c.to.toFixed(2)})'`,
    );
  });
  const part = path.join(work, `part-${String(index).padStart(2, "0")}.mp4`);
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", path.join(dir, clipFile), "-vf", filters.join(","), "-r", "25", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", part],
    { stdio: "inherit" },
  );
  parts.push(part);
  console.log(`${clipFile}: ${mine.length} caption(s)`);
});

const list = path.join(work, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
mkdirSync(path.dirname(output), { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output], { stdio: "inherit" });
const seconds = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output]).toString().trim();
console.log(`${output}: ${Math.round(Number(seconds))} s`);
