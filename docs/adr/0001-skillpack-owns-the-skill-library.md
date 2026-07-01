---
status: superseded by ADR-0005
---

# Skillpack owns the Skill Library

Skillpack will treat its own Skill Library as the source of truth for installed skill content and provenance, while agent platform directories become generated projections of activations. This replaces the current provider-centric model where Skillpack scans provider folders and infers ownership afterward, trading some migration complexity for cleaner duplicate handling, update tracking, and cross-agent enablement.
