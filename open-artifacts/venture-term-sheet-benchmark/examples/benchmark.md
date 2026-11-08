# Term sheet benchmark — Quillform Analytics, Inc. (fictional) (series_a, 2026)

Benchmark grid as of **2026-01**. 3 inside market · 7 outside market · 0 without benchmark.

| Term | Value | Verdict | Benchmark | Source |
|---|---|---|---|---|
| liquidation_preference_multiple | 1.5 | **outside_market** (favors investor) | 1 x | NVCA structure + EXAMPLE numeric default — replace with dated market data (as of 2026-01) |
| participation | participating | **outside_market** (favors investor) | non_participating | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| anti_dilution | full_ratchet | **outside_market** (favors investor) | broad_based_weighted_average | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| seniority | senior_to_all_prior | **outside_market** (favors investor) | pari_passu | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| investor_board_seats | 2 | **inside_market** | 1–2 seats | EXAMPLE DEFAULT — not market data; replace with your own dated source (as of 2026-01) |
| dividends | cumulative | **outside_market** (favors investor) | none, non_cumulative | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| redemption | investor_demand_after_5y | **outside_market** (favors investor) | none | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| pro_rata_rights | granted_major_investors | **inside_market** | granted_major_investors | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |
| pay_to_play | none | **inside_market** | none, present | NVCA structure + EXAMPLE numeric default — replace with dated market data (as of 2026-01) |
| founder_vesting_restart | true | **outside_market** (favors investor) | false | NVCA Model Legal Documents (public structural baseline, nvca.org) (as of 2026-01) |

## Term references

- **liquidation_preference_multiple** — Multiple of the original purchase price repaid to preferred stock before common stock in a liquidation (NVCA Certificate of Incorporation). ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **participation** — Whether preferred stock also shares in remaining proceeds after its liquidation preference is paid. ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **anti_dilution** — Adjustment to the preferred conversion price when the company issues shares at a lower price (weighted-average vs full-ratchet forms). ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **seniority** — Ranking of this series’ liquidation preference relative to other preferred series (pari passu or senior). ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **investor_board_seats** — Board seats allocated to investors under the financing’s governance documents (NVCA Voting Agreement). ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **dividends** — Dividend on preferred stock: none, non-cumulative when declared, or accruing cumulative. ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **redemption** — Right of investors to require the company to repurchase their shares after a set period. ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **pro_rata_rights** — Right of investors to purchase a proportional share of a future round (NVCA Investor Rights Agreement). ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **pay_to_play** — Requirement that investors keep investing pro rata or lose senior preferred rights. ([NVCA model docs](https://nvca.org/model-legal-docs/))
- **founder_vesting_restart** — Whether founder shares restart vesting at this round (NVCA Stock Purchase Agreement context). ([NVCA model docs](https://nvca.org/model-legal-docs/))

---

> Structural enums follow the NVCA Model Legal Documents (public at nvca.org) as a STRUCTURE baseline only. All numeric ranges and percentile bands are EXAMPLE defaults for demonstration — replace them with your own dated market data (deal corpus or published surveys) before relying on any verdict.

_Deterministic output of the open venture-term-sheet-benchmark. Not legal advice; verdicts describe distance from an editable grid, not deal quality._
