"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  type EventSummaryItem,
  type LearningResource,
  type LearningResourceInput,
  type ResourceCategoryId,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/api";
import {
  RESOURCE_TYPES,
  isWebAddress,
  parseResourceCategoryPath,
  resourceCategoryId,
  resourceFolderLabel,
  resourceFolders,
  resourceTrackForCategory,
  typeLabel,
} from "@/lib/learningResources";
import styles from "./AdminWorkflows.module.css";

/** Event resource fields, as the API names them, in words. */
const EVENT_LINK_NAMES: Record<string, string> = {
  recording_url: "recording",
  slides_url: "slides",
  writeup_url: "write-up",
};

const EMPTY_FORM = {
  title: "",
  url: "",
  description: "",
  categoryId: "" as ResourceCategoryId | "",
  type: "article" as ResourceType,
  tags: "",
  eventId: "",
  status: "published" as ResourceStatus,
};

function listNames(fields: string[]) {
  return fields.map((field) => EVENT_LINK_NAMES[field] ?? field).join(", ");
}

/**
 * Curate the Learning Resources hub: add, edit, hide and delete links, and
 * save an event's recording, slides and write-up into the hub.
 */
export default function AdminLearningResourcesPanel({ token }: { token: string }) {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [events, setEvents] = useState<EventSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventToSave, setEventToSave] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listLearningResources({}, token);
      setResources(result.resources);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Learning resources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    api.listEvents(token, { limit: 100 })
      .then((result) => setEvents(result.events))
      .catch(() => setEvents([]));
  }, [token]);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(resource: LearningResource) {
    setEditingId(resource.id);
    setForm({
      title: resource.title,
      url: resource.url,
      description: resource.description,
      categoryId: resourceFolderLabel(resourceCategoryId(resource)) === "General pool"
        ? ""
        : resourceFolderLabel(resourceCategoryId(resource)),
      type: resource.type,
      tags: resource.tags.join(", "),
      eventId: resource.event_id ?? "",
      status: resource.status,
    });
    setError("");
    setNotice("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const categoryPath = parseResourceCategoryPath(form.categoryId);
    if (!categoryPath.valid) {
      setError("Use up to eight folder names separated by /. Each folder name must contain letters or numbers.");
      return;
    }
    const payload: LearningResourceInput = {
      title: form.title.trim(),
      url: form.url.trim(),
      description: form.description.trim(),
      category_id: categoryPath.categoryId,
      track: resourceTrackForCategory(categoryPath.categoryId),
      type: form.type,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
      event_id: form.eventId || null,
      status: form.status,
    };
    void run(async () => {
      if (editingId) {
        const saved = await api.adminUpdateLearningResource(token, editingId, payload);
        cancelEdit();
        return `Saved “${saved.title}”.`;
      }
      const created = await api.adminCreateLearningResource(token, payload);
      setForm(EMPTY_FORM);
      return `Added “${created.title}”.`;
    });
  }

  function toggleHidden(resource: LearningResource) {
    const status: ResourceStatus = resource.status === "hidden" ? "published" : "hidden";
    void run(async () => {
      await api.adminUpdateLearningResource(token, resource.id, { status });
      return status === "hidden" ? `Hid “${resource.title}” from members.` : `“${resource.title}” is visible to members again.`;
    });
  }

  function remove(resource: LearningResource) {
    if (!window.confirm(`Delete “${resource.title}”? This cannot be undone.`)) return;
    void run(async () => {
      await api.adminDeleteLearningResource(token, resource.id);
      if (editingId === resource.id) cancelEdit();
      return `Deleted “${resource.title}”.`;
    });
  }

  function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventToSave) return;
    void run(async () => {
      const result = await api.adminSaveEventResources(token, eventToSave);
      const parts: string[] = [];
      if (result.created.length) parts.push(`Saved ${result.created.length} ${result.created.length === 1 ? "link" : "links"} (${result.created.map((item) => typeLabel(item.type).toLowerCase()).join(", ")}).`);
      if (result.already_saved.length) parts.push(`Already in the hub: ${listNames(result.already_saved)}.`);
      if (result.skipped.length) parts.push(`Skipped ${listNames(result.skipped)}: not a web address. Fix the link on the event and save again.`);
      return parts.length ? parts.join(" ") : "This event has no recording, slides or write-up links yet.";
    });
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Learning Resources</h2>
          <p>Links members see in the Learning Resources hub. Hidden ones stay here but not in the hub.</p>
        </div>
      </div>

      {error && <div role="alert" className={styles.error}>{error}</div>}
      {notice && <div role="status" className={styles.successNotice}>{notice}</div>}

      <form className={styles.form} onSubmit={saveEvent} aria-labelledby="save-event-heading">
        <h3 id="save-event-heading">Save an event’s resources</h3>
        <p className={styles.fieldHint}>Adds the event’s recording, slides and write-up links to the hub. Saving again only adds links that are not there yet.</p>
        <label>
          Event
          <select className={styles.field} value={eventToSave} onChange={(event) => setEventToSave(event.target.value)} required>
            <option value="">Choose an event</option>
            {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !eventToSave}>Save to Learning Resources</button>
      </form>

      <form className={styles.form} onSubmit={submit} aria-labelledby="resource-form-heading">
        <h3 id="resource-form-heading">{editingId ? "Edit resource" : "Add a resource"}</h3>
        <label>
          Title
          <input required maxLength={200} value={form.title} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label>
          Link
          <input
            required
            type="url"
            // The server accepts http(s) only; pattern keeps the browser in step.
            pattern="https?://.+"
            maxLength={2048}
            value={form.url}
            onChange={(event) => update("url", event.target.value)}
            placeholder="https://…"
          />
        </label>
        <label>
          Description (optional)
          <textarea maxLength={2000} value={form.description} onChange={(event) => update("description", event.target.value)} />
        </label>
        <label>
          Category path
          <input
            list="learning-resource-category-paths"
            value={form.categoryId}
            onChange={(event) => update("categoryId", event.target.value)}
            placeholder="e.g. Theory / CML / MNIST"
            aria-describedby="learning-resource-category-hint"
          />
          <datalist id="learning-resource-category-paths">
            {resourceFolders(resources).map((folder) => <option key={folder.id} value={resourceFolderLabel(folder.id)} />)}
          </datalist>
          <small id="learning-resource-category-hint" className={styles.fieldHint}>
            Use / between nested folders. Leave blank for the General pool. A folder appears after a link is saved in it.
          </small>
        </label>
        <label>
          Type
          <select className={styles.field} value={form.type} onChange={(event) => update("type", event.target.value as ResourceType)}>
            {RESOURCE_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Tags (comma-separated, up to 10)
          <input value={form.tags} onChange={(event) => update("tags", event.target.value)} />
        </label>
        <label>
          Related event (optional)
          <select className={styles.field} value={form.eventId} onChange={(event) => update("eventId", event.target.value)}>
            <option value="">None</option>
            {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            {form.eventId && !events.some((item) => item.id === form.eventId) && <option value={form.eventId}>{form.eventId}</option>}
          </select>
        </label>
        <label>
          Visibility
          <select className={styles.field} value={form.status} onChange={(event) => update("status", event.target.value as ResourceStatus)}>
            <option value="published">Visible to members</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <div className={styles.formActions}>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Add resource"}</button>
          {editingId && <button type="button" className={styles.secondaryBtn} onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      <h3>All resources ({resources.length})</h3>
      {loading && <p className={styles.loadingText}>Loading resources…</p>}
      {!loading && resources.length === 0 && !error && (
        <div className={styles.emptyContainer}><h3>No resources yet</h3><p>Add a link above, or save an event’s recording and slides.</p></div>
      )}
      <ul className={styles.list} aria-label="Learning resources">
        {resources.map((resource) => (
          <li key={resource.id} className={styles.row}>
            <div>
              {isWebAddress(resource.url)
                ? <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a>
                : <strong>{resource.title}</strong>}
              <small className={styles.resourceMeta}>
                {typeLabel(resource.type)} · {resourceFolderLabel(resourceCategoryId(resource))}
                {resource.event_title ? ` · from ${resource.event_title}` : ""}
                {resource.status === "hidden" ? " · hidden" : ""}
              </small>
            </div>
            <div className={styles.rowActions}>
              <button type="button" disabled={busy} onClick={() => startEdit(resource)} aria-label={`Edit ${resource.title}`}>Edit</button>
              <button type="button" disabled={busy} onClick={() => toggleHidden(resource)} aria-label={`${resource.status === "hidden" ? "Show" : "Hide"} ${resource.title}`}>
                {resource.status === "hidden" ? "Show" : "Hide"}
              </button>
              <button type="button" disabled={busy} onClick={() => remove(resource)} aria-label={`Delete ${resource.title}`}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
