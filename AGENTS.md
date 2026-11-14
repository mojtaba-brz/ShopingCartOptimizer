# CartOptimizer maintenance

- Keep desktop web and Android changes together. Shared shopping, matching,
  quantity/unit-price comparison, result presentation and themes belong in the
  common web assets. Implement retailer access through `CartwiseRetailer`.
- Never silently fall back to the reviewed-offer workflow when automatic access
  is unavailable. Report the actual dependency or connection problem.
- Use `cartoptimizer/release.json` as the release/version authority. Update build
  artifact labels and release documentation in the same change. Run the release
  synchronization test and both desktop/Android flow checks.
- Preserve selected delivery locations; validate a new point with Jet before
  storing it. Do not export login state, credentials or personal browser profiles.
- Distinguish platform-specific capabilities and actual live verification from
  fixture tests. Do not claim complete inventory coverage when capped or partial.
- Do not persist signing keys in the repository, artifacts or workflow caches.

- Use the shared `jet-search-task.js` for independent desktop/Android search pages.
  Bound concurrency using available hardware. Keep cart-count limits independent
  of browser concurrency: base three carts, adaptive expansion within the measured
  budget. Do not restore a top-20 candidate cutoff.
- Group basket lines by verified merchant identity. Charge each store separately;
  unknown fees must stay unknown. Keep unit-price option ranking separate from
  whole-basket payable-cost estimates.

- Keep merchant business type in identities and fee observations. Optimize each department independently, including single/two/three-store and selected-store modes. Never infer a bigger physical request from a cheaper package size.
- Reuse only address/mode-bound fresh catalogue data; always prune deleted items and recompute quantities. Map points require the same range verification as text addresses.

- Use package-size.js for multipack contents and two-ply-equivalent tissue sheets. Never multiply explicit total weights again; keep ambiguous labels unknown.
- Ordinary discounts repeat for every unit. Amazing quotas are shared across all goods in each typed merchant basket (supermarket two packages, other types one); allocate them with fees and thresholds, not independently per product. Never call a struck ordinary price the verified post-amazing price without evidence.
- Automatic search commits valid shopping drafts and ignores unrelated hidden legacy drafts. Reverted inputs must clear stale dirty flags; invalid shopping input must remain editable without refresh.
