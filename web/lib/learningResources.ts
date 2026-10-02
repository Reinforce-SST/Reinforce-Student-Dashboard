import type { LearningResource, ResourceCategoryId, ResourceTrack, ResourceType } from "./api";

/** Display labels for Learning Resources, shared by the hub and admin panel. */
export const RESOURCE_TRACKS: { value: ResourceTrack; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "product", label: "Product" },
  { value: "kaggle", label: "Kaggle" },
  { value: "general", label: "General" },
];

const LEGACY_FOLDER: Record<ResourceTrack, ResourceCategoryId | null> = {
  research: "theory",
  kaggle: "kaggle",
  product: "product",
  general: null,
};

const CATEGORY_LABELS: Record<string, string> = {
  theory: "Theory",
  cml: "CML",
  dml: "DML",
  rl: "RL",
  kaggle: "Kaggle",
  product: "Product",
  events: "Events",
  cnn: "CNN",
  mnist: "MNIST",
};

export type ResourceFolder = {
  id: ResourceCategoryId;
  name: string;
  parentId: ResourceCategoryId | null;
};

const DEFAULT_RESOURCE_FOLDERS: ResourceFolder[] = [
  { id: "theory", name: "Theory", parentId: null },
  { id: "theory/cml", name: "CML", parentId: "theory" },
  { id: "theory/dml", name: "DML", parentId: "theory" },
  { id: "theory/rl", name: "RL", parentId: "theory" },
  { id: "kaggle", name: "Kaggle", parentId: null },
  { id: "product", name: "Product", parentId: null },
  { id: "events", name: "Events", parentId: null },
];

/** Missing category_id is an older API/resource record; null means pool root. */
export function resourceCategoryId(resource: Pick<LearningResource, "category_id" | "track">): ResourceCategoryId | null {
  return resource.category_id === undefined ? LEGACY_FOLDER[resource.track] : resource.category_id;
}

export function resourceTrackForCategory(categoryId: ResourceCategoryId | null): ResourceTrack {
  if (categoryId === null) return "general";
  const root = categoryId.split("/", 1)[0];
  if (root === "kaggle") return "kaggle";
  if (root === "product") return "product";
  if (root === "theory") return "research";
  return "general";
}

function categorySegmentLabel(segment: string) {
  const known = CATEGORY_LABELS[segment.toLowerCase()];
  if (known) return known;
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => /^\d+$/.test(word) ? word : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function resourceFolderLabel(categoryId: ResourceCategoryId | null): string {
  if (categoryId === null) return "General pool";
  return categoryId.split("/").map(categorySegmentLabel).join(" / ");
}

export function resourceFolderAncestors(categoryId: ResourceCategoryId | null): ResourceFolder[] {
  if (categoryId === null) return [];
  const segments = categoryId.split("/");
  return segments.map((name, index) => ({
    id: segments.slice(0, index + 1).join("/"),
    name: categorySegmentLabel(name),
    parentId: index ? segments.slice(0, index).join("/") : null,
  }));
}

/** Build every visible folder from the slash-separated paths already on links. */
export function resourceFolders(resources: Pick<LearningResource, "category_id" | "track">[]): ResourceFolder[] {
  const folders = new Map(DEFAULT_RESOURCE_FOLDERS.map((folder) => [folder.id, folder]));
  for (const resource of resources) {
    for (const folder of resourceFolderAncestors(resourceCategoryId(resource))) {
      folders.set(folder.id, folder);
    }
  }
  return [...folders.values()].sort((left, right) => left.id.localeCompare(right.id, "en", { sensitivity: "base" }));
}

function slugCategorySegment(segment: string) {
  return segment
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert a human-entered `Theory / CML / MNIST` path to a safe stored path. */
export function parseResourceCategoryPath(input: string): { valid: true; categoryId: ResourceCategoryId | null } | { valid: false } {
  if (!input.trim()) return { valid: true, categoryId: null };
  const names = input.split("/").map((name) => name.trim());
  if (names.length > 8 || names.some((name) => !name)) return { valid: false };
  const segments = names.map(slugCategorySegment);
  const categoryId = segments.join("/");
  if (categoryId.length > 240 || segments.some((segment) => !segment || segment.length > 48)) return { valid: false };
  return { valid: true, categoryId };
}

export function eventResourceCategoryPath(slug: string | null | undefined, title: string): ResourceCategoryId {
  const parsed = parseResourceCategoryPath(slug || title);
  const segment = parsed.valid && parsed.categoryId ? parsed.categoryId : "untitled-event";
  return `events/${segment}`;
}

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "course", label: "Course" },
  { value: "docs", label: "Documentation" },
  { value: "repo", label: "Repository" },
  { value: "slides", label: "Slides" },
  { value: "recording", label: "Recording" },
  { value: "other", label: "Other" },
];

export const trackLabel = (track: ResourceTrack) =>
  RESOURCE_TRACKS.find((item) => item.value === track)?.label ?? track;

export const typeLabel = (type: ResourceType) =>
  RESOURCE_TYPES.find((item) => item.value === type)?.label ?? type;

/** The API only stores http(s) links; this keeps an older or hand-edited row from rendering as a script link. */
export const isWebAddress = (url: string) => /^https?:\/\/[^/\s]/i.test(url);
