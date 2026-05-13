import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const scenesPath = path.join(root, "scenes.json");
const extraPath = path.join(__dirname, "highrise-briefing-templates.json");

const scenes = JSON.parse(fs.readFileSync(scenesPath, "utf8"));
const extra = JSON.parse(fs.readFileSync(extraPath, "utf8"));
const hr = scenes["高楼灭火"];
if (!hr) throw new Error("missing 高楼灭火");

if (extra.documentDepthHints) {
  hr.documentDepthHints = Object.assign({}, extra.documentDepthHints, hr.documentDepthHints || {});
}
if (extra.briefingDepthTemplates) {
  hr.briefingDepthTemplates = hr.briefingDepthTemplates || {};
  if (extra.briefingDepthTemplates.technical) {
    hr.briefingDepthTemplates.technical = extra.briefingDepthTemplates.technical;
  }
  if (extra.briefingDepthTemplates.full) {
    hr.briefingDepthTemplates.full = extra.briefingDepthTemplates.full;
  }
}

hr.aircraftModel = { primary: "FC100", reconnaissance: "M400" };
hr.operationFlow = [
  "T+0min：M400 RTK + 禅思 H30T 起飞侦察（快速响应，可依托机场 3 网格）。",
  "T+2min：热成像穿透浓烟，锁定火点坐标，回传司空 2 / 指挥车。",
  "T+3min：FC100 携 ≥150 m 级高压水带升空，对准起火层建立射流（地面泵组/系留功率按 SOP）。",
  "T+3min+：Mavic 4 Enterprise（红外）升空，监测余火与飞火，向指挥席旁路图传。"
];

fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2) + "\n", "utf8");
console.log("Merged high-rise briefing templates into scenes.json");
