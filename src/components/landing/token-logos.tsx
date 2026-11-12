import type { SVGProps } from "react";

// Chains
export function NearLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#000000" />
      <path
        d="M6.5 16.5V7.5H10.2L14.8 13.8V7.5H17.5V16.5H13.8L9.2 10.2V16.5H6.5Z"
        fill="#00EC97"
      />
    </svg>
  );
}

export function BaseLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#0052FF" />
      <path
        d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12C4.5 16.14 7.86 19.5 12 19.5C15.8 19.5 18.94 16.68 19.43 13H13.5V11H19.43C18.94 7.32 15.8 4.5 12 4.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function ArbitrumLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#28A0F0" />
      <path
        d="M16.8 16.5H14.1L12.5 11.3L15.2 6.5H18L16.8 16.5ZM7.2 16.5H9.9L13.8 9.5L12.1 6.5H9.3L7.2 16.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function EthereumLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#627EEA" />
      <path d="M12 4.5L6.5 12.2L12 15L17.5 12.2L12 4.5Z" fill="#FFFFFF" fillOpacity="0.85" />
      <path d="M12 4.5L12 15L17.5 12.2L12 4.5Z" fill="#FFFFFF" />
      <path d="M12 15.8L6.5 13L12 19.5L17.5 13L12 15.8Z" fill="#FFFFFF" fillOpacity="0.85" />
      <path d="M12 15.8L12 19.5L17.5 13L12 15.8Z" fill="#FFFFFF" />
    </svg>
  );
}

export function SolanaLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#000000" />
      <path
        d="M6 15.5L7.5 14H18L16.5 15.5H6ZM6 12L7.5 10.5H18L16.5 12H6ZM6 8.5L7.5 7H18L16.5 8.5H6Z"
        fill="url(#solana-grad)"
      />
      <defs>
        <linearGradient id="solana-grad" x1="6" y1="7" x2="18" y2="15.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Tokens
export function UsdcLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#2775CA" />
      <path
        d="M13.2 8.4C12.4 8.2 11.2 8.2 10.6 8.6C10.1 9 10 9.5 10 9.9C10 10.7 10.6 11.1 11.8 11.5L12.6 11.8C14.1 12.3 14.8 13.1 14.8 14.2C14.8 15.4 13.7 16.3 12.1 16.3C10.8 16.3 9.7 15.9 9 15.3L9.6 14.1C10.4 14.7 11.2 15 12.1 15C12.8 15 13.3 14.6 13.3 14.1C13.3 13.4 12.7 13 11.5 12.6L10.7 12.3C9.3 11.8 8.6 11 8.6 9.9C8.6 8.7 9.7 7.7 11.3 7.7C12.2 7.7 13.2 8 13.8 8.4L13.2 8.4ZM11.6 6.5V7.7M11.6 16.3V17.5"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UsdtLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#26A17B" />
      <path
        d="M14.5 9H9.5V10.5H11.2V16H12.8V10.5H14.5V9ZM12 11.8C10.2 11.8 8.7 11.4 8.7 11C8.7 10.6 10.2 10.2 12 10.2C13.8 10.2 15.3 10.6 15.3 11C15.3 11.4 13.8 11.8 12 11.8Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function BtcLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#F7931A" />
      <path
        d="M15.5 11.2C15.8 10.6 15.9 9.9 15.4 9.2C14.8 8.5 13.7 8.3 12.5 8.3V6.5H11.2V8.3H10V6.5H8.8V8.3H7.5V9.7H8.8V15.3H7.5V16.7H8.8V18.5H10V16.7H11.2V18.5H12.5V16.7C14.3 16.6 15.7 15.9 16 14.3C16.2 13.3 15.9 12.1 15.5 11.2ZM10.5 9.7H12.3C13.2 9.7 13.8 10.1 13.7 11C13.6 11.8 12.9 12.2 12 12.2H10.5V9.7ZM12.5 15.3H10.5V12.7H12.6C13.6 12.7 14.3 13.2 14.2 14C14.1 14.8 13.4 15.3 12.5 15.3Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function WnearLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return <NearLogo className={className} {...props} />;
}

// Protocols
export function MorphoLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#181D27" />
      <path
        d="M8 15.5V8.5L12 12.5L16 8.5V15.5"
        stroke="#22C55E"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AaveLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#B6509E" />
      <path
        d="M12 7L7.5 16.5H9.5L10.7 14H13.3L14.5 16.5H16.5L12 7ZM11.2 12.5L12 10.5L12.8 12.5H11.2Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function UniswapLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#FF007A" />
      <path
        d="M14.5 8C15 8.5 16 10 15 11.5C14 13 12.5 13 12 14.5C11.5 16 12 17 12 17C12 17 10.5 16 10 14.5C9.5 13 10 11.5 11 10C12 8.5 13.5 8 14.5 8Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function CompoundLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#00D395" />
      <path
        d="M7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17H7V12Z"
        fill="#0D1B2A"
      />
    </svg>
  );
}

export function CurveLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#FF4444" />
      <path
        d="M7 16C7 11 11 7 17 7M7 16H17M17 7V16"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KaminoLogo({ className = "size-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="#00D2B4" />
      <path
        d="M7.5 16.5V7.5L12 12L16.5 7.5V16.5"
        stroke="#042F2C"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
