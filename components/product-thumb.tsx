export function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return <div className="size-10 shrink-0 rounded-md bg-muted" aria-hidden />;
  }
  // Mock CDN URLs are not in next/image remotePatterns; a plain img is the honest path.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="size-10 shrink-0 rounded-md object-cover" />;
}
