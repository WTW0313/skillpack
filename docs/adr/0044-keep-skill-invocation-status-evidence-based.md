# Keep Skill Invocation Status evidence-based

Skillpack will normalize Skill Invocation Status to provider-evidence states such as loaded, used, failed, and unknown. It will not infer task success from later session outcomes, because usage analytics should report what provider session artifacts prove rather than imply that a skill solved the user's work.

For Codex, a direct `SKILL.md` read with a zero exit code is recorded as `used`; a direct `SKILL.md` read with a non-zero exit code is recorded as `failed`; missing output evidence remains `unknown`. This means failed reads are preserved as facts but do not inflate normal invocation counts.

For orchestrated Codex `exec` envelopes, the outer `completed` status and script-level output describe the JavaScript wrapper rather than any individual nested shell command. A statically confirmed `SKILL.md` read therefore remains `unknown` unless provider evidence supplies a reliable one-to-one nested exit result. Skillpack does not infer nested success or failure from wrapper status, human-readable output, or error text; `unknown` remains a Counted Invocation.

For Claude, a structured `Skill` tool use is recorded as `used` unless a matching structured tool result has `is_error === true`, which records `failed`. Claude records without a valid assistant timestamp are skipped rather than dated from the transcript file's modification time.
