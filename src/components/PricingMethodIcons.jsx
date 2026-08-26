function IconBase({ children, size = 24, color = 'currentColor', strokeWidth = 2, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CurrencyExchangeIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20.5 9A9 9 0 0 0 5.2 5.2L3 7.5" />
      <path d="M3 3v4.5h4.5" />
      <path d="M3.5 15A9 9 0 0 0 18.8 18.8L21 16.5" />
      <path d="M21 21v-4.5h-4.5" />
      <path d="M15.25 8.5h-4.5a2 2 0 0 0 0 4h2.5a2 2 0 0 1 0 4h-4.5" />
      <path d="M12 6.5v12" />
    </IconBase>
  );
}

export function MoneyOffIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M16.5 7.5C16 6.6 15 6 13.5 6h-3C9.1 6 8 6.9 8 8.2c0 .8.35 1.35.95 1.75" />
      <path d="M15.2 14.05c.5.35.8.9.8 1.65 0 1.3-1.1 2.3-2.5 2.3h-3c-1.4 0-2.5-.6-3-1.5" />
      <path d="M3 3l18 18" />
    </IconBase>
  );
}
