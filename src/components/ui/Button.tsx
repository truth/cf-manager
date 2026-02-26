import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function Button({
  children,
  className,
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={classNames('btn', `btn--${variant}`, className)}
      type={props.type ?? 'button'}
    >
      {children}
    </button>
  );
}
