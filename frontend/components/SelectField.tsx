"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import MaterialIcon from "@/components/MaterialIcon";

export type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export default function SelectField({
  id,
  value,
  options,
  onChange,
  placeholder = "Chọn...",
  disabled = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SelectFieldProps) {
  const generatedId = useId();
  const controlId = id || `select-${generatedId.replace(/:/g, "")}`;
  const listboxId = `${controlId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        const start = open ? index : Math.max(selectedIndex, 0);
        return (start + direction + options.length) % options.length;
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      select(activeIndex);
    }
  }

  return (
    <div ref={rootRef} className={`select-field${open ? " select-field--open" : ""}`}>
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className="select-field__trigger"
        role="combobox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${controlId}-option-${activeIndex}` : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => setOpen((current) => {
          if (!current) setActiveIndex(Math.max(selectedIndex, 0));
          return !current;
        })}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
      >
        <span className={selected ? undefined : "select-field__placeholder"}>{selected?.label || placeholder}</span>
        <MaterialIcon name={open ? "expand_less" : "expand_more"} size={22} />
      </button>
      {open && (
        <ul id={listboxId} className="select-field__menu" role="listbox" aria-labelledby={controlId}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                id={`${controlId}-option-${index}`}
                key={option.value || "__empty"}
                className={`select-field__option${isSelected ? " select-field__option--selected" : ""}${isActive ? " select-field__option--active" : ""}`}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => select(index)}
              >
                <span>{option.label}</span>
                {isSelected && <MaterialIcon name="check" size={19} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
