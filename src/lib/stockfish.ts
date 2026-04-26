export type StockfishAnalysis = {
  bestMove: string | null;
  scoreCp: number | null;
  mate: number | null;
  raw: string[];
};

function supportsWorker() {
  return typeof Worker !== "undefined";
}

export function canUseStockfish() {
  return supportsWorker();
}

export function analyzeFen(fen: string, depth = 11): Promise<StockfishAnalysis> {
  if (!supportsWorker()) {
    return Promise.resolve({ bestMove: null, scoreCp: null, mate: null, raw: [] });
  }

  return new Promise((resolve) => {
    const workerPath =
      typeof WebAssembly === "object"
        ? "/stockfish/stockfish.wasm.js"
        : "/stockfish/stockfish.js";
    const worker = new Worker(workerPath);
    const raw: string[] = [];
    let scoreCp: number | null = null;
    let mate: number | null = null;
    let settled = false;

    const finish = (bestMove: string | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve({ bestMove, scoreCp, mate, raw });
    };

    const timeout = window.setTimeout(() => finish(null), 7000);

    worker.addEventListener("message", (event: MessageEvent<string>) => {
      const line = String(event.data);
      raw.push(line);

      const cpMatch = line.match(/score cp (-?\d+)/);
      if (cpMatch) scoreCp = Number(cpMatch[1]);

      const mateMatch = line.match(/score mate (-?\d+)/);
      if (mateMatch) mate = Number(mateMatch[1]);

      if (line.startsWith("bestmove")) {
        window.clearTimeout(timeout);
        finish(line.split(" ")[1] || null);
      }
    });

    worker.postMessage("uci");
    worker.postMessage("isready");
    worker.postMessage("ucinewgame");
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth}`);
  });
}
