interface Props {
  title?: string;
  className?: string;
}

export default function EventImagePlaceholder({ title, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1040] via-[#1e1a4a] to-[#0d1a3a] ${className}`}>
      {/* Ticket SVG */}
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-3 opacity-60"
      >
        <rect x="4" y="16" width="56" height="32" rx="4" fill="none" stroke="#F32B81" strokeWidth="2"/>
        <line x1="22" y1="16" x2="22" y2="48" stroke="#3ED2D1" strokeWidth="2" strokeDasharray="4 3"/>
        <circle cx="22" cy="16" r="3" fill="#1a1040" stroke="#3ED2D1" strokeWidth="2"/>
        <circle cx="22" cy="48" r="3" fill="#1a1040" stroke="#3ED2D1" strokeWidth="2"/>
        <rect x="28" y="24" width="20" height="3" rx="1.5" fill="#F8D21F" opacity="0.7"/>
        <rect x="28" y="31" width="14" height="2" rx="1" fill="white" opacity="0.3"/>
        <rect x="28" y="37" width="16" height="2" rx="1" fill="white" opacity="0.2"/>
        <circle cx="10" cy="32" r="2" fill="#F32B81" opacity="0.6"/>
      </svg>

      {title ? (
        <p className="text-white/40 text-xs text-center px-4 line-clamp-2">{title}</p>
      ) : (
        <p className="text-white/30 text-xs">Event Image</p>
      )}
    </div>
  );
}
