// frontend/src/components/common/Logo.jsx
// NexVibe's app-icon mark: a rounded-square gradient badge (matches the
// site's existing .ig-gradient warmth) with an original twin-sparkle glyph —
// intentionally not a literal camera icon and not a letter mark.
export default function Logo({ size = 32, className = '', ...rest }) {
  return (
    <div
      className={`ig-gradient rounded-xl flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <svg viewBox="0 0 100 100" style={{ width: size * 0.56, height: size * 0.56 }} fill="none" aria-hidden="true">
        <path d="M50 20C53 40 60 47 80 50C60 53 53 60 50 80C47 60 40 53 20 50C40 47 47 40 50 20Z" fill="white" />
        <path d="M74 17C75.5 22 78 24.5 83 26C78 27.5 75.5 30 74 35C72.5 30 70 27.5 65 26C70 24.5 72.5 22 74 17Z" fill="white" />
      </svg>
    </div>
  );
}
