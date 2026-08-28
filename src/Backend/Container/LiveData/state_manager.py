"""
State Manager — tracks pipeline state across runs.

Persists region hash and per-tier last-fetch timestamps so the pipeline
only re-fetches data that actually needs refreshing.
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone


class StateManager:
    """Manages pipeline state: region hash and per-tier fetch timestamps."""

    _DEFAULT_STATE = {
        "region_hash": None,
        "last_static_fetch": None,
        "last_periodic_fetch": None,
        "last_realtime_fetch": None,
        "last_earthquake_fetch": None,
    }

    def __init__(self, state_file: str):
        self.state_file = Path(state_file)
        self.state = self._load()

    # ── Persistence ───────────────────────────────────────────────────────

    def _load(self) -> dict:
        if self.state_file.exists():
            with open(self.state_file, "r") as f:
                saved = json.load(f)
            # Merge with defaults so new keys are always present
            return {**self._DEFAULT_STATE, **saved}
        return dict(self._DEFAULT_STATE)

    def save(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, "w") as f:
            json.dump(self.state, f, indent=2)

    # ── Region Change Detection ───────────────────────────────────────────

    @staticmethod
    def compute_region_hash(region_config: dict) -> str:
        """SHA-256 hash of the region config (bbox + resolution)."""
        config_str = json.dumps(region_config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()[:16]

    def has_region_changed(self, region_config: dict) -> bool:
        current_hash = self.compute_region_hash(region_config)
        return self.state["region_hash"] != current_hash

    def update_region_hash(self, region_config: dict):
        self.state["region_hash"] = self.compute_region_hash(region_config)

    # ── Tier Refresh Checks ───────────────────────────────────────────────

    def needs_static_fetch(self, region_config: dict) -> bool:
        """Static data: only on region change or first run."""
        return (
            self.has_region_changed(region_config)
            or self.state["last_static_fetch"] is None
        )

    def needs_periodic_fetch(self, region_config: dict, refresh_days: int) -> bool:
        """Periodic data: on region change, first run, or stale (> refresh_days)."""
        if self.has_region_changed(region_config):
            return True
        if self.state["last_periodic_fetch"] is None:
            return True
        last = datetime.fromisoformat(self.state["last_periodic_fetch"])
        elapsed = (datetime.now(timezone.utc) - last).total_seconds() / 86400
        return elapsed >= refresh_days

    # ── Timestamp Updates ─────────────────────────────────────────────────

    def update_timestamp(self, tier: str):
        """Record the current UTC time as the last-fetch for a tier."""
        key = f"last_{tier}_fetch"
        if key not in self.state:
            raise ValueError(f"Unknown tier: {tier}")
        self.state[key] = datetime.now(timezone.utc).isoformat()

    def reset_all(self):
        """Nullify all timestamps — forces a full refresh on next run."""
        for key in self._DEFAULT_STATE:
            if key != "region_hash":
                self.state[key] = None
