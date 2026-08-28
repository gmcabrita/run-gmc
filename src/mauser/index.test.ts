import { describe, expect, it } from "vitest";
import { parseMauserSc1176StockPage } from "./index";

function pageWithStockStatus(stockStatus: string) {
  return `<html>
<body>
<span>096-4559</span>
${stockStatus}
</body>
</html>`;
}

describe("parseMauserSc1176StockPage", () => {
  it("detects unavailable stock status even when structured data says in stock", () => {
    const page = pageWithStockStatus(`
<script type="application/ld+json">
{
  "sku": "096-4559",
  "offers": {
    "availability": "http://Schema.org/InStock"
  }
}
</script>
<div class="stock big sold-out stock-status">
  <div class="status vertical sold-out">
    <span>Indisponível </span>
    <span class="estimation">Sem Previsão de Entrega</span>
  </div>
</div>`);

    expect(parseMauserSc1176StockPage(page)).toMatchObject({
      status: "out_of_stock",
    });
  });

  it("detects available stock status", () => {
    const page = pageWithStockStatus(`
<div class="stock big stock stock-status">
  <div class="status vertical stock">
    <span>Em Stock <span style="font-weight: 700;">(100 unidades)</span></span>
    <span class="estimation">Entrega entre 1 a 3 dias úteis</span>
  </div>
</div>`);

    expect(parseMauserSc1176StockPage(page)).toMatchObject({
      status: "in_stock",
    });
  });

  it("rejects pages without the target SKU", () => {
    expect(() =>
      parseMauserSc1176StockPage(
        pageWithStockStatus(
          `<div class="stock big in-stock stock-status">Disponível</div>`,
        ).replace("096-4559", "095-0000"),
      ),
    ).toThrow("Mauser product page missing SKU 096-4559");
  });
});
