"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeList } from "@/lib/student-utils";

/** Chip-style input: commit with comma / Enter / blur, Backspace on empty removes the last chip. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions,
  invalid,
  label,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  invalid?: boolean;
  label: string;
}) {
  const [text, setText] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const parts = raw.split(",");
    if (parts.every((p) => !p.trim())) {
      setText("");
      return;
    }
    onChange(normalizeList([...value, ...parts]));
    setText("");
  }

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        invalid && "border-destructive",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={label}
        list={suggestions ? listId : undefined}
        value={text}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(text)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
