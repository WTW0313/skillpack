# Require consent for Skill Usage Import

Skillpack will require Usage Import Consent before reading provider-owned session artifacts for Skill Usage Import. After consent is granted, bounded incremental imports may run on startup, but the first import must be explicit because provider session artifacts are private even when Skillpack persists only minimal Skill Invocation Records.
