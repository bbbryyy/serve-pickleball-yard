/** Store item photo, or a neutral "No image" placeholder when the item has none. */
export function ItemImage({ url, name, className = "" }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div className={`flex flex-col items-center justify-center gap-1 bg-kitchen-light text-steel/45 ${className}`} role="img" aria-label="No image">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 17 5-5 4 4 2.5-2.5L20 17" />
      </svg>
      <span className="text-[10px] font-semibold">No image</span>
    </div>
  );
}
