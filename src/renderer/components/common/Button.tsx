import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: ReactNode;
}

export function Button({ variant = 'ghost', className = '', icon, children, ...props }: ButtonProps) {
  return (
    <button type="button" className={`btn btn--${variant}${className ? ` ${className}` : ''}`} {...props}>
      {icon}
      {children}
    </button>
  );
}
