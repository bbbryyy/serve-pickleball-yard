import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b-4 border-surround bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <Link href="/" className="flex items-center" aria-label="Serve Pickleball Yard home">
          <Image src="/brand/logo.jpeg" alt="Serve Pickleball Yard" width={1678} height={937} className="h-12 w-auto sm:h-14" priority />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold text-steel sm:gap-4">
          <Link href="/#hours" className="hidden rounded px-2 py-1 hover:text-court sm:block">Hours and rates</Link>
          <Link href="/#courts" className="hidden rounded px-2 py-1 hover:text-court sm:block">Courts</Link>
          <Link href="/#coaching" className="hidden rounded px-2 py-1 hover:text-court sm:block">Coaching</Link>
          <Link href="/booking" className="rounded px-2 py-1 hover:text-court">My booking</Link>
          <Link href="/book" className="btn-primary px-3 py-2 sm:px-4">Book a court</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-steel text-sm text-white/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-base tracking-wide text-white uppercase">Serve Pickleball Yard</span>{" "}
          · <span className="italic text-surround">Play with purpose</span>
        </p>
        <p className="flex gap-4">
          <Link href="/book" className="hover:text-white">Book a court</Link>
          <Link href="/booking" className="hover:text-white">Check a booking</Link>
          <Link href="/backoffice" className="hover:text-white">Staff</Link>
        </p>
      </div>
    </footer>
  );
}
