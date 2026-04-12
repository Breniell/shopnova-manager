/**
 * merge-demo-videos.js
 *
 * Fusionne toutes les vidéos Playwright de demo-results/ en une seule vidéo MP4.
 *
 * Prérequis : ffmpeg installé (https://ffmpeg.org/download.html)
 *   Windows : winget install ffmpeg  ou  choco install ffmpeg
 *
 * Usage :
 *   node scripts/merge-demo-videos.js
 *
 * Sortie :
 *   demo-results/legwan-demo.mp4
 */

import { execSync } from "child_process";
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const DEMO_DIR   = resolve("demo-results");
const OUTPUT     = join(DEMO_DIR, "legwan-demo.mp4");
const LIST_FILE  = join(DEMO_DIR, "_concat_list.txt");

// ─── Trouver les vidéos ──────────────────────────────────────────────────────

function findVideos(dir) {
  const videos = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        videos.push(...findVideos(fullPath));
      } else if (entry.name.endsWith(".webm") || entry.name.endsWith(".mp4")) {
        if (!entry.name.includes("legwan-demo")) {
          videos.push(fullPath);
        }
      }
    }
  } catch { /* ignore */ }
  return videos.sort(); // ordre alphabétique = ordre des scènes
}

// ─── Vérifier ffmpeg ─────────────────────────────────────────────────────────

function checkFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

if (!checkFfmpeg()) {
  console.error("\n❌ ffmpeg non trouvé. Installez-le avec :");
  console.error("   winget install ffmpeg");
  console.error("   ou téléchargez depuis https://ffmpeg.org/download.html\n");
  process.exit(1);
}

if (!existsSync(DEMO_DIR)) {
  console.error(`\n❌ Dossier ${DEMO_DIR} introuvable.`);
  console.error("   Lancez d'abord : npx playwright test tests/demo.spec.ts\n");
  process.exit(1);
}

const videos = findVideos(DEMO_DIR);

if (videos.length === 0) {
  console.error("\n❌ Aucune vidéo trouvée dans demo-results/");
  console.error("   Lancez d'abord : npx playwright test tests/demo.spec.ts\n");
  process.exit(1);
}

console.log(`\n✅ ${videos.length} vidéo(s) trouvée(s) :\n`);
videos.forEach(v => console.log("  •", v));

// Crée le fichier de liste pour ffmpeg concat
const listContent = videos.map(v => `file '${v.replace(/\\/g, "/")}'`).join("\n");
writeFileSync(LIST_FILE, listContent, "utf8");

console.log("\n🎬 Fusion en cours...\n");

try {
  // Normalise toutes les vidéos au même format puis concatène
  const cmd = [
    "ffmpeg",
    "-y",                          // overwrite sans confirmation
    "-f", "concat",
    "-safe", "0",
    "-i", `"${LIST_FILE}"`,
    "-vf", "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",                  // qualité (18=max, 28=min)
    "-pix_fmt", "yuv420p",         // compatible partout
    "-movflags", "+faststart",     // lecture progressive (streaming)
    `"${OUTPUT}"`,
  ].join(" ");

  execSync(cmd, { stdio: "inherit" });

  console.log(`\n✅ Vidéo finale générée :`);
  console.log(`   ${OUTPUT}\n`);
} catch (err) {
  console.error("\n❌ Erreur ffmpeg :", err.message);
  process.exit(1);
}
