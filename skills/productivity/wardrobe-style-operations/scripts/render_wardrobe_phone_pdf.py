#!/usr/bin/env python3
"""Placeholder helper contract for Wardrobe phone PDF rendering.

The production Gateway only needs this file to prove that the complete
Wardrobe Skill bundle was installed. Rendering implementations must be added
through the normal Home AI document/PDF tool boundary and must not read
Wardrobe key files or private payloads directly.
"""

from __future__ import annotations


def main() -> int:
    print("wardrobe phone PDF helper is not configured in this install")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
