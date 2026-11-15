import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold text-steel uppercase">Out of bounds</h1>
      <p className="mt-2 text-sm text-steel/70">We couldn&apos;t find that page or booking. Check the reference and try again.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/booking" className="btn-court">Check a booking</Link>
        <Link href="/" className="btn-ghost">Home</Link>
      </div>
    </div>
  );
}
