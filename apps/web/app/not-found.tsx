import Link from "next/link";
export default function NotFound() {
  return (
    <main className="shell section">
      <h1 style={{ fontSize: 54 }}>Market not found.</h1>
      <p className="muted">This address is not an indexed Meme Lend market.</p>
      <Link className="button primary" href="/markets">
        Explore markets
      </Link>
    </main>
  );
}
