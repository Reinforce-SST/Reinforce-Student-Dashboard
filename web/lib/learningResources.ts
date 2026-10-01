import type { ResourceTrack, ResourceType } from "./api";

/** Display labels for Learning Resources, shared by the hub and the admin panel. */
export const RESOURCE_TRACKS: { value: ResourceTrack; label: string }[] = [
  { value: "research", label: "Research" },
  { value: "product", label: "Product" },
  { value: "kaggle", label: "Kaggle" },
  { value: "general", label: "General" },
];

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
