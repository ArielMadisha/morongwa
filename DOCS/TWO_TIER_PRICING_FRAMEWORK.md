# 2-Tier Dropshipping Pricing Framework

## Overview

Qwertymates uses a **two-layer dropshipping system**:

1. **You** dropship from suppliers (CJ, Spocket, EPROLO) → your platform
2. **Your users** dropship from your platform → their customers

Pricing must:
- Protect platform margin
- Leave enough markup headroom for resellers
- Keep final prices market-competitive

## 3-Layer Pricing Structure

| Layer | Name | Formula | Who |
|-------|------|---------|-----|
| 1 | Supplier Cost (C) | — | What we pay CJ/Spocket/EPROLO |
| 2 | Platform Price (P) | P = C × platformMultiplier | What resellers pay us |
| 3 | Reseller Final Price (R) | R = P ÷ (1 − resellerMargin) | What end customers pay |

## Target Margins

| Layer | Typical Margin |
|-------|----------------|
| Platform | 15% – 30% |
| Resellers | 30% – 60% |
| Combined | 50% – 70% total |

## Category-Based Markups

| Category | Platform Multiplier | Platform Margin | Reseller Margin |
|----------|---------------------|------------------|-----------------|
| Fashion | 1.3× – 1.6× | 20–35% | 30–60% |
| Beauty | 1.4× – 1.7× | 30–40% | 30–60% |
| Home | 1.3× – 1.5× | ~29% | 30–60% |
| Electronics | 1.15× – 1.3× | ~18% | 25–40% |
| Baby/Kids | 1.3× – 1.6× | ~31% | 30–60% |
| Pet | 1.4× – 1.7× | ~35% | 30–60% |
| Fitness | 1.3× – 1.6× | ~31% | 30–60% |

## Product Fields (External/Dropshipped)

- `supplierCost` – raw cost from supplier
- `price` – platform price (P) = what resellers pay
- `qwertymatesMarkupPct` – platform margin %
- `recommendedResellerPrice` – suggested R for resellers
- `minResalePrice` – MAP; resellers cannot sell below this
- `resellerMarginPct` – default reseller margin for this product

## Platform Rules

1. **Show recommended selling price** – min, max, expected profit
2. **Lock minimum resale price (MAP)** – especially for electronics, branded goods
3. **Default margins for beginners** – category-based, editable by advanced users

## Example (Pet Product)

- Supplier cost: R200
- Platform margin 35% → P = R270
- Reseller margin 55% → R = 270 ÷ (1 − 0.55) = R600

Platform earns R70; reseller earns R330.
