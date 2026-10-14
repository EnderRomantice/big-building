# 42-agent provenance

Upstream: https://github.com/42-club/42-agent
Commit: d4bdf6af52353a907426cb64c4c792a2be111c5e
Package version: 0.1.0
License: Apache-2.0 (preserved in 42-agent-LICENSE and inside the package)
Archive SHA-256: b7d4514e0af3914a20e628adc035dccb7c0ac7bba2ddf7bb374e1b911efd24a1

Built without source modifications with `npm ci` followed by `npm pack` at the pinned commit. The registry had no public 42-agent package during integration. The project uses this local archive to avoid an unpinned Git dependency and missing dist files. Runtime transitive dependency resolution is pinned by the root package-lock.json.

To update: review a new commit, run its tests, package it, update this provenance and the root dependency lockfile, then rerun the game integration tests. Do not overwrite the archive with unreviewed source under the same provenance.
