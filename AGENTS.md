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
