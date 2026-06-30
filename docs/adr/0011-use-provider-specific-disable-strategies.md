# Use provider-specific Disable Strategies

Skillpack will implement enable/disable through provider-specific Disable Strategies. A provider adapter should use a known provider configuration mechanism when one exists, and use `.disabled-` directory renaming only as a fallback when the provider has no known config file or native disable mechanism for skills.
