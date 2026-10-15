import type { AlphaMode, MaterialPreset, MaterialPresetMap, RenderClass, ShaderGraph, StyleGroup } from "reze-engine"
import {
  BODY_GRAPH,
  CLOTH_ROUGH_GRAPH,
  CLOTH_SMOOTH_GRAPH,
  EYE_GRAPH,
  FACE_GRAPH,
  HAIR_GRAPH,
  METAL_GRAPH,
  STOCKINGS_GRAPH,
} from "reze-engine"

export const MATERIAL_PRESETS: MaterialPreset[] = [
  "default",
  "face",
  "body",
  "eye",
  "hair",
  "cloth_smooth",
  "cloth_rough",
  "stockings",
  "metal",
]

export const MATERIAL_PRESET_LABEL: Record<MaterialPreset, string> = {
  default: "Default",
  face: "Face",
  body: "Body",
  eye: "Eye",
  hair: "Hair",
  cloth_smooth: "Smooth Cloth",
  cloth_rough: "Rough Cloth",
  stockings: "Stockings",
  metal: "Metal",
}

const CLASSIFY_KEYWORDS: Partial<Record<MaterialPreset, string[]>> = {
  eye: ["眼睛", "眼白", "目白", "右瞳", "左瞳", "眉毛", "eye", "iris", "pupil", "brow"],
  face: ["脸", "顔", "face"],
  hair: ["头发", "髪", "hair"],
  stockings: ["袜子", "stocking", "tights", "pantyhose"],
  metal: ["earring", "metal", "金属"],
  cloth_smooth: [
    "衣服",
    "裙子",
    "裙带",
    "裙布",
    "外套",
    "外套饰",
    "裤子",
    "裤子0",
    "腿环",
    "发饰",
    "鞋子",
    "鞋子饰",
    "shirt",
    "shoes",
    "shorts",
    "trigger",
    "dress",
    "hair_accessory",
    "cloth01_shoes",
    "cloth",
    "skirt",
    "jacket",
    "pants",
  ],
  body: ["皮肤", "skin", "body"],
}

const CLASSIFY_ORDER: MaterialPreset[] = ["eye", "face", "hair", "stockings", "metal", "cloth_smooth", "body"]

export function autoClassifyMaterials(materialNames: readonly string[]): MaterialPresetMap {
  const next: MaterialPresetMap = {}
  for (const raw of materialNames) {
    if (!raw) continue
    const lower = raw.toLowerCase()
    for (const preset of CLASSIFY_ORDER) {
      const kws = CLASSIFY_KEYWORDS[preset]
      if (!kws) continue
      if (!kws.some((k) => lower.includes(k.toLowerCase()))) continue
      const bucket = (next[preset] ??= [])
      bucket.push(raw)
      break
    }
  }
  return next
}

export function presetForMaterial(materialName: string, map: MaterialPresetMap): MaterialPreset {
  for (const preset of MATERIAL_PRESETS) {
    if (preset === "default") continue
    if (map[preset]?.includes(materialName)) return preset
  }
  return "default"
}

export function setMaterialPreset(
  map: MaterialPresetMap,
  materialName: string,
  preset: MaterialPreset,
): MaterialPresetMap {
  const next: MaterialPresetMap = {}
  for (const key of MATERIAL_PRESETS) {
    if (key === "default") continue
    const names = map[key]
    if (!names) continue
    const kept = names.filter((n) => n !== materialName)
    if (kept.length > 0) next[key] = kept
  }
  if (preset !== "default") {
    const bucket = (next[preset] ??= [])
    if (!bucket.includes(materialName)) bucket.push(materialName)
  }
  return next
}

const GRAPH_FOR_PRESET: Record<Exclude<MaterialPreset, "default">, ShaderGraph> = {
  face: FACE_GRAPH,
  body: BODY_GRAPH,
  eye: EYE_GRAPH,
  hair: HAIR_GRAPH,
  cloth_smooth: CLOTH_SMOOTH_GRAPH,
  cloth_rough: CLOTH_ROUGH_GRAPH,
  stockings: STOCKINGS_GRAPH,
  metal: METAL_GRAPH,
}

const RENDER_CLASS_FOR_PRESET: Partial<Record<MaterialPreset, RenderClass>> = {
  eye: "eye",
  hair: "hair",
}

const ALPHA_MODE_FOR_PRESET: Partial<Record<MaterialPreset, AlphaMode>> = {
  stockings: "hashed",
}

export function buildStyleGroups(map: MaterialPresetMap): StyleGroup[] {
  const groups: StyleGroup[] = []
  for (const preset of MATERIAL_PRESETS) {
    if (preset === "default") continue
    const materials = map[preset]
    if (!materials || materials.length === 0) continue
    groups.push({
      id: preset,
      label: MATERIAL_PRESET_LABEL[preset],
      materials: [...materials],
      graph: GRAPH_FOR_PRESET[preset],
      renderClass: RENDER_CLASS_FOR_PRESET[preset] ?? "auto",
      alphaMode: ALPHA_MODE_FOR_PRESET[preset] ?? "opaque",
    })
  }
  return groups
}

const KNOWN_PRESETS = new Set<string>(MATERIAL_PRESETS)

export function styleGroupsToPresetMap(groups: readonly StyleGroup[]): MaterialPresetMap {
  const map: MaterialPresetMap = {}
  for (const g of groups) {
    if (g.id === "default" || !KNOWN_PRESETS.has(g.id) || g.materials.length === 0) continue
    map[g.id as MaterialPreset] = [...g.materials]
  }
  return map
}
