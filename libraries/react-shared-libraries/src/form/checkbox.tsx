'use client';

import { forwardRef, KeyboardEvent, useCallback, useId } from 'react';
import clsx from 'clsx';
import { useFormContext } from 'react-hook-form';
export const Checkbox = forwardRef<
  null,
  {
    checked?: boolean;
    disableForm?: boolean;
    // Kaido (TikTok guideline 2c/3b): disabled used to be ignored, so every
    // "greyed out" checkbox was still clickable. It now blocks mouse and
    // keyboard and is announced as aria-disabled.
    disabled?: boolean;
    name?: string;
    className?: string;
    label?: string;
    // Shown as a native tooltip, e.g. why the checkbox is disabled.
    title?: string;
    onChange?: (event: {
      target: {
        name?: string;
        value: boolean;
      };
    }) => void;
    variant?: 'default' | 'hollow';
  }
>((props, ref: any) => {
  const { checked, className, label, disableForm, variant, disabled, title } =
    props;
  const labelId = useId();
  const form = useFormContext();
  const register = disableForm ? {} : form.register(props.name!);
  const watch = disableForm ? false : form.watch(props.name!);
  const val = !!(watch || checked);

  const changeStatus = useCallback(() => {
    if (disabled) {
      return;
    }
    props?.onChange?.({
      target: {
        name: props.name!,
        value: !val,
      },
    });
    if (!disableForm) {
      // @ts-ignore
      register?.onChange?.({
        target: {
          name: props.name!,
          value: !val,
        },
      });
    }
  }, [val, disabled]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        changeStatus();
      }
    },
    [changeStatus]
  );

  return (
    <div
      className={clsx('flex gap-[10px] items-center', disabled && 'opacity-50')}
      title={title}
    >
      <div
        ref={ref}
        {...(disableForm ? {} : form.register(props.name!))}
        role="checkbox"
        aria-checked={val}
        aria-disabled={disabled || undefined}
        aria-labelledby={label ? labelId : undefined}
        tabIndex={0}
        onClick={changeStatus}
        onKeyDown={onKeyDown}
        className={clsx(
          'shrink-0 rounded-[4px] select-none w-[24px] h-[24px] justify-center items-center flex text-white',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#612BD3] dark:focus-visible:outline-[#B69DEC]',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          variant === 'default' || !variant
            ? 'bg-forth'
            : 'border-customColor1 border-2 bg-customColor2',
          className
        )}
      >
        {val && (
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        )}
      </div>
      {!!label && (
        <div
          id={labelId}
          onClick={changeStatus}
          className={clsx(
            'select-none',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
});
