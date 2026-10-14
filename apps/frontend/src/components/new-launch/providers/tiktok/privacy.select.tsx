'use client';

import { FC, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';

export interface PrivacyOption {
  value: string;
  label: string;
  /** Why the option can't be chosen right now; shown as a tooltip on hover and keyboard focus. */
  blockedReason?: string;
}

/**
 * "Who can see this video?" as a select-only combobox (WAI-ARIA APG pattern).
 *
 * Kaido (C18): TikTok guideline 3b wants "Only me" locked for branded content
 * and the reason shown when hovering it. A native <select> can disable the
 * option but Chrome/macOS never shows a title on it, so the reviewer would not
 * see the reason. Here a blocked option stays reachable by mouse and keyboard
 * (aria-disabled), can't be chosen, and shows its reason as a tooltip.
 */
export const PrivacySelect: FC<{
  label: string;
  placeholder: string;
  options: PrivacyOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}> = ({ label, placeholder, options, value, onChange, disabled, error }) => {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const tipId = `${id}-tip`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const outside = useClickOutside(() => open && setOpen(false));

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (open && active >= 0) {
      document
        .getElementById(optionId(active))
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, active]);

  const openAt = (i: number) => {
    setActive(Math.max(0, Math.min(options.length - 1, i)));
    setOpen(true);
  };

  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.blockedReason) return false;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openAt(
          selectedIndex >= 0
            ? selectedIndex
            : e.key === 'ArrowUp'
            ? last
            : 0
        );
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        openAt(e.key === 'Home' ? 0 : last);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) choose(active);
        else setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
      case 'PageUp':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
      case 'PageDown':
        e.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        // Close only the list, not the post editor around it.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case 'Tab':
        if (!options[active]?.blockedReason && active >= 0) {
          onChange(options[active].value);
        }
        setOpen(false);
        break;
    }
  };

  return (
    <div className="flex flex-col gap-[6px]" ref={outside}>
      <div id={labelId} className="text-[14px]">
        {label}
      </div>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-activedescendant={
            open && active >= 0 ? optionId(active) : undefined
          }
          aria-invalid={!!error || undefined}
          disabled={disabled}
          onClick={() =>
            open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0)
          }
          onKeyDown={onKeyDown}
          className={clsx(
            'h-[42px] w-full bg-newBgColorInner px-[16px] border rounded-[8px] text-[14px] flex items-center justify-between gap-[8px] text-start',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#612BD3] dark:focus-visible:outline-[#B69DEC]',
            open ? 'border-[#612BD3]' : 'border-newTableBorder',
            disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          <span className={clsx(!selected && 'text-newTextColor/70')}>
            {selected ? selected.label : placeholder}
          </span>
          <DropdownArrowIcon rotated={open} aria-hidden="true" />
        </button>
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          hidden={!open}
          className="z-[300] absolute start-0 top-[100%] mt-[4px] w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] py-[6px] menu-shadow"
        >
          {options.map((option, i) => {
            const blocked = !!option.blockedReason;
            const isActive = i === active;
            return (
              <li
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-label={option.label}
                aria-selected={option.value === value}
                aria-disabled={blocked || undefined}
                aria-describedby={blocked && isActive ? tipId : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={clsx(
                  'relative min-h-[40px] px-[16px] py-[8px] flex items-center justify-between gap-[8px] text-[14px] select-none',
                  isActive && 'bg-newBgColor',
                  blocked
                    ? 'cursor-not-allowed text-newTextColor/60'
                    : 'cursor-pointer'
                )}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8.5l3.2 3L13 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {blocked && isActive && (
                  <div
                    id={tipId}
                    role="tooltip"
                    className="absolute z-[310] end-[8px] top-1/2 -translate-y-1/2 max-w-[65%] rounded-[6px] bg-[#222] ring-1 ring-white/15 px-[12px] py-[6px] text-[13px] leading-[1.4] text-white shadow-lg pointer-events-none"
                  >
                    {option.blockedReason}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div
        className="text-red-600 dark:text-red-400 text-[12px]"
        role={error ? 'alert' : undefined}
      >
        {error || <>&nbsp;</>}
      </div>
    </div>
  );
};
