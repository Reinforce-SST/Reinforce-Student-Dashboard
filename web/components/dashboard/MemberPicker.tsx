"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api, type StudentProfile } from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import styles from "./MemberPicker.module.css";

/** The fields a picked member needs; StudentProfile and directory rows both fit. */
export type PickedMember = Pick<StudentProfile, "id" | "full_name" | "avatar_url">;

/**
 * Find members by name and pick them, instead of typing account IDs nobody
 * knows. Searches the public member directory once two characters are typed.
 *
 * A combobox in the ARIA sense: arrow keys move through the results, Enter
 * picks, Escape closes. Picked members show as chips with a remove button.
 */
export default function MemberPicker({
  token,
  label,
  selected,
  onChange,
  excludeIds = [],
  max,
}: {
  token: string;
  label: string;
  selected: PickedMember[];
  onChange: (members: PickedMember[]) => void;
  /** Members who can never be picked, such as the person filling in the form. */
  excludeIds?: string[];
  /** The most members that can be picked. */
  max: number;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<PickedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = selected.length >= max;
  const hidden = new Set([...excludeIds, ...selected.map((member) => member.id)]);
  const options = results.filter((member) => !hidden.has(member.id));

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    api.browseUsers(token, { search: debounced, page_size: 8 })
      .then((page) => { if (live) setResults(page.items ?? []); })
      .catch(() => { if (live) { setResults([]); setError("Members could not be searched. Try again."); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [debounced, token]);

  useEffect(() => { setActive(-1); }, [debounced]);

  function pick(member: PickedMember) {
    if (full || hidden.has(member.id)) return;
    onChange([...selected, { id: member.id, full_name: member.full_name, avatar_url: member.avatar_url }]);
    // Results are kept, not cleared: retyping the same search inside the
    // debounce window would otherwise find nothing, since no new search runs.
    // The picked member drops out of them through `hidden`.
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(member: PickedMember) {
    onChange(selected.filter((item) => item.id !== member.id));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === "Enter" && open && active >= 0 && options[active]) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const showList = open && query.trim().length >= 2 && debounced.length >= 2 && !full;
  const status = full
    ? `Team is full (${max} ${max === 1 ? "teammate" : "teammates"}).`
    : loading ? "Searching…"
    : showList && options.length === 0 && !error ? "No members match that name."
    : "";

  return (
    <div className={styles.picker}>
      <label htmlFor={inputId} className={styles.label}>{label}</label>
      {selected.length > 0 && (
        <ul className={styles.chips} aria-label="Selected teammates">
          {selected.map((member) => (
            <li key={member.id} className={styles.chip}>
              <span>{member.full_name}</span>
              <button type="button" onClick={() => remove(member)} aria-label={`Remove ${member.full_name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.field}>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 && options[active] ? `${listId}-${options[active].id}` : undefined}
          autoComplete="off"
          placeholder={full ? "Team is full" : "Search members by name"}
          disabled={full}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={styles.input}
        />
        {showList && options.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Matching members" className={styles.list}>
            {options.map((member, index) => (
              <li
                key={member.id}
                id={`${listId}-${member.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? styles.optionActive : styles.option}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(event) => { event.preventDefault(); pick(member); }}
              >
                {member.full_name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={styles.status} role="status" aria-live="polite">{error || status}</p>
    </div>
  );
}
