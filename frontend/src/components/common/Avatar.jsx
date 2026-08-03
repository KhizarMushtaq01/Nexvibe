export default function Avatar({ src, size = 40, alt = '', className = '', ring = false, onClick }) {
  const s = typeof size === 'number' ? size : 40;
  const initial = alt ? alt.trim().charAt(0).toUpperCase() : '?';

  const content = src
    ? <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
    : (
      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold select-none"
        style={{ fontSize: Math.max(s * 0.38, 11) }}>
        {initial}
      </div>
    );

  if (ring) {
    return (
      <div onClick={onClick} style={{ width: s, height: s }}
        className={`relative inline-flex flex-shrink-0 rounded-full ${onClick ? 'cursor-pointer' : ''} ${className}`}>
        <div className="absolute inset-0 rounded-full ig-gradient p-[2px]">
          <div className="w-full h-full rounded-full bg-[var(--bg-primary)] p-[2px] overflow-hidden">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{ width: s, height: s }}
      className={`inline-flex flex-shrink-0 rounded-full overflow-hidden ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''} ${className}`}>
      {content}
    </div>
  );
}
