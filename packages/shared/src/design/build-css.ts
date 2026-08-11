import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Literal .ts specifiers: this script runs directly via `node`, not a bundler.
import { contrastRatio, WCAG_AA_LARGE_TEXT_OR_UI, WCAG_AA_TEXT } from "./contrast.ts";
import { color } from "./tokens.ts";
import { generateTailwindThemeCss, generateVariablesCss } from "./generate-css.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "generated");

function checkContrast(): boolean {
  const backgrounds = {
    "forest-canopy": color.core.forestCanopy,
    "vault-floor": color.core.vaultFloor,
  };
  const foregrounds = {
    "signal-red": color.signal.red,
    "signal-amber": color.signal.amber,
    "lime-phosphor": color.core.limePhosphor,
    white: color.core.white,
  };

  console.log("Contrast check (WCAG 2.x, text ≥ 4.5:1, large-text/UI ≥ 3:1) — 1.8\n");

  let allPass = true;
  for (const [fgName, fgHex] of Object.entries(foregrounds)) {
    for (const [bgName, bgHex] of Object.entries(backgrounds)) {
      const ratio = contrastRatio(fgHex, bgHex);
      const passesText = ratio >= WCAG_AA_TEXT;
      const passesLarge = ratio >= WCAG_AA_LARGE_TEXT_OR_UI;
      if (!passesLarge) allPass = false;
      const verdict = passesText ? "PASS text" : passesLarge ? "PASS large/UI only" : "FAIL";
      console.log(`  ${fgName} on ${bgName}: ${ratio.toFixed(2)}:1 — ${verdict}`);
    }
  }

  console.log("");
  return allPass;
}

function main(): void {
  const contrastOk = checkContrast();
  if (!contrastOk) {
    console.error(
      "Contrast check failed the 3:1 large-text/UI floor — fix tokens.ts before generating CSS.",
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "variables.css"), generateVariablesCss(), "utf8");
  writeFileSync(join(outDir, "tailwind-theme.css"), generateTailwindThemeCss(), "utf8");

  console.log(`Wrote ${join(outDir, "variables.css")}`);
  console.log(`Wrote ${join(outDir, "tailwind-theme.css")}`);
}

main();
