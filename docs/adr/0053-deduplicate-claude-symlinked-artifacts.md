# Deduplicate Claude symlinked artifacts

Claude Skill Usage Import will follow JSONL file symlinks under configured Claude artifact roots, resolve each candidate with `realpath`, and parse each real artifact once. This avoids dropping valid subagent transcripts while preventing shared symlinked transcripts from being double-counted.
