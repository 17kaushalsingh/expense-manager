import Link from "next/link";
export default function Offline() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="panel max-w-md space-y-4">
        <h1 className="text-2xl font-bold">You’re offline</h1>
        <p>
          Reconnect to view your accounts and shared expenses. LedgerSync does
          not cache your financial records for offline access.
        </p>
        <p>
          Financial changes require a connection. Keep any open form until you
          reconnect.
        </p>
        <Link className="btn inline-block" href="/">
          Try again
        </Link>
      </section>
    </main>
  );
}
