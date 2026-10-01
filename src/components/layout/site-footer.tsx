export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Data from Etherscan, Blockstream Esplora, TronGrid and CoinGecko. Read-only —
          TxRadar never asks for keys or signatures.
        </p>
        <p className="mono-data">Runs on your machine</p>
      </div>
    </footer>
  );
}
