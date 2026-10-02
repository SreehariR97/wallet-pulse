"use client";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces
 * the whole document, so it can't rely on the app's CSS or providers.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: 16,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>WalletPulse hit a problem</h1>
          <p style={{ color: "#555", marginBottom: 16 }}>Your data is safe. Try reloading the page.</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
