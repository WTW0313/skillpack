# Use append-only invocation revisions

Skill Usage Import will append a revised Skill Invocation Record with the same Invocation Record ID when later provider evidence changes a previously imported fact, and readers will use only the latest record for each ID. This preserves append-only JSONL storage while allowing an active Claude transcript's initial `used` record to become `failed` when a later matching structured tool result reports an error.

Revisions must preserve the record's provider and `startedAt` month so every version of one ID remains in one authoritative partition. Changes to either partition key are importer changes that rebuild provider records under a new importer version rather than ordinary revisions.
