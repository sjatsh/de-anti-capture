import type { CSSProperties } from 'react';

interface IconProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, className, style }: IconProps) {
  return (
    <svg className={`ico${className ? ' ' + className : ''}`} style={style}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
