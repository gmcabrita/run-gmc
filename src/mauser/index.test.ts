import { describe, expect, it } from "vitest";
import { parseMauserStockStatus } from "./index";

describe("parseMauserStockStatus", () => {
  it("ignores related product stock and reads main sold-out status", () => {
    const html = `
      <div class="related-product"><span>Em Stock</span></div>
      <div class="stock big sold-out stock-status">
        <span class="icon big"
          ><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M5.04004 5L18.48 19"
              stroke="#888888"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
            <path
              d="M21.36 12C21.36 6.47715 17.0619 2 11.76 2C6.4581 2 2.16003 6.47715 2.16003 12C2.16003 17.5228 6.4581 22 11.76 22C17.0619 22 21.36 17.5228 21.36 12Z"
              stroke="#888888"
              stroke-width="1.5"
            ></path>
          </svg>
        </span>
        <div class="info vertical">
          <div class="status vertical sold-out">
            <span>Indisponível </span>
            <span class="estimation">Sem Previsão de Entrega</span>
          </div>
        </div>
      </div>

    `;

    expect(parseMauserStockStatus(html)).toEqual({ kind: "out-of-stock", label: "Indisponível" });
  });

  it("parses main in-stock status", () => {
    const html = `
      <div class="stock big stock stock-status">
        <span class="icon big"
          ><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z"
              stroke="#3dad3d"
              stroke-width="1.5"
            ></path>
            <path
              d="M8 12.5L10.5 15L16 9"
              stroke="#3DAD3D"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </span>
        <div class="info vertical">
          <div class="status vertical stock">
            <span>Em Stock <span style="font-weight: 700">(664 unidades)</span></span>
            <span class="estimation">Entrega entre 1 a 3 dias úteis</span>
          </div>
        </div>
      </div>

    `;

    expect(parseMauserStockStatus(html)).toEqual({ kind: "in-stock", label: "Em Stock" });
  });

  it("returns unknown when main stock block is missing", () => {
    expect(parseMauserStockStatus("<html></html>")).toEqual({
      kind: "unknown",
      reason: "stock status block not found",
    });
  });
});
