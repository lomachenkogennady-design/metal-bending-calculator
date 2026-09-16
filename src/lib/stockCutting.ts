export interface StockPart {
  id: string;
  title: string;
  length: number;  // мм
  qty: number;
}

export interface StockPiece {
  partId: string;
  title: string;
  length: number;
  offset: number;  // мм от начала хлыста
}

export interface StockBar {
  index: number;
  pieces: StockPiece[];
  usedLength: number;
  waste: number;
}

export interface StockResult {
  bars: StockBar[];
  barCount: number;
  utilization: number;
  stockLength: number;
  totalWaste: number;
}

/** First Fit Decreasing — сортируем по убыванию длины, кладём в первый подходящий хлыст */
export function stockCutting(
  parts: StockPart[],
  stockLength = 6000,
): StockResult {
  // Разворачиваем
  const pieces: { id: string; title: string; length: number }[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.qty; i++) {
      pieces.push({ id: p.id, title: p.title, length: p.length });
    }
  }

  // Сортировка по убыванию
  pieces.sort((a, b) => b.length - a.length);

  const bars: StockBar[] = [];

  for (const piece of pieces) {
    if (piece.length > stockLength) continue; // не влезает — пропускаем

    let placed = false;
    for (const bar of bars) {
      if (bar.usedLength + piece.length <= stockLength) {
        bar.pieces.push({ partId: piece.id, title: piece.title, length: piece.length, offset: bar.usedLength });
        bar.usedLength += piece.length;
        bar.waste = stockLength - bar.usedLength;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bars.push({
        index: bars.length + 1,
        pieces: [{ partId: piece.id, title: piece.title, length: piece.length, offset: 0 }],
        usedLength: piece.length,
        waste: stockLength - piece.length,
      });
    }
  }

  const totalUsed = bars.reduce((s, b) => s + b.usedLength, 0);
  const totalWaste = bars.reduce((s, b) => s + b.waste, 0);
  return {
    bars,
    barCount: bars.length,
    utilization: bars.length > 0 ? totalUsed / (bars.length * stockLength) : 0,
    stockLength,
    totalWaste,
  };
}
