# Skillpack

Skillpack is a unified management console for reusable agent skills across agent platforms and shared skill locations.

## Language

**Skill**:
A reusable instruction package that an agent can load and apply during work.
_Avoid_: Prompt, plugin, rule

**Skill Provider**:
An agent platform or shared skill location whose own rules determine where skills live and how they are loaded.
_Avoid_: Skill Library, projection target

**Provider-Native State**:
The skill inventory and availability state as represented by a Skill Provider's own files, metadata, and conventions.
_Avoid_: Skillpack state, canonical state

**Skill Availability**:
Whether a discovered skill is currently loadable by a specific Skill Provider according to that provider's own configuration, metadata, and loading rules.
_Avoid_: Directory exists, installed state

**Install Source**:
A place Skillpack can search or fetch skills from before placing them into a Skill Provider.
_Avoid_: Skill Provider, registry

**Global Skill**:
A skill in the shared global skills location managed through the skills.sh ecosystem.
_Avoid_: Universal skill, Skill Library entry

**Shared Skill Content**:
A skill directory that may be referenced by more than one Skill Provider. Availability for one provider must not be expressed by moving or renaming shared content.
_Avoid_: Provider toggle target, per-agent state

**Project Skill**:
A skill stored inside a project repository and maintained by that repository's authors through git.
_Avoid_: Global Skill, managed skill

**Plugin-Owned Skill**:
A skill distributed as part of a provider plugin. Its availability may depend on the owning plugin's access state as well as any provider-specific per-skill state.
_Avoid_: Provider-local skill, independent toggle target

**skills.sh**:
The external skill ecosystem and CLI used for installing, updating, and removing Global Skills.
_Avoid_: GitHub install source, package manager

**Unmanaged On-Disk Skill**:
A discovered skill whose source is not identified from skills.sh metadata. These skills may live in Codex, Claude, Global, or Project skill directories, but Skillpack treats their content as provider-owned or repository-owned.
_Avoid_: Installed skill, Skillpack-created skill

**Skill Inventory**:
The cross-provider view of discovered skills, their provenance, availability, and health.
_Avoid_: Skill editor, authoring workspace

**Provider Instance**:
A discovered skill as represented by one Skill Provider, including that provider's availability and provenance for the skill.
_Avoid_: Skill Group row, duplicate

**Terminal Envelope**:
The terminal size range the TUI deliberately designs and verifies for: a full baseline layout at 80x24, a compact usable layout down to 60x18, and a minimal too-small layout below that.
_Avoid_: Responsive target, screen size

**Terminal Compatibility**:
The TUI's ability to remain understandable across terminals with different color, glyph, width, and resize behavior.
_Avoid_: Pretty terminal rendering, theme support

**Terminal UI Test**:
A test that verifies the rendered Skillpack TUI state and keyboard-driven interaction from the user's terminal perspective.
_Avoid_: CLI I/O Test, unit test

**CLI I/O Test**:
A test that verifies the Skillpack command process contract through standard input, standard output, signals, and terminal control sequences.
_Avoid_: Terminal UI Test, component test

**Scan Root**:
A directory Skillpack inspects to discover provider, shared global, or project skills.
_Avoid_: Skill, provider, install source

**Inventory Notice**:
A non-problem inventory fact that helps the user understand provider coverage, provenance, or grouping confidence.
_Avoid_: Warning, issue

**Inventory Issue**:
A deterministic inventory finding that means a Provider Instance likely needs attention or a user decision.
_Avoid_: Notice, security score, quality rating

Inventory Notices include update opportunities, unmanaged local provenance, and weak name-only relationships. Inventory Issues are reserved for findings that directly affect reliability or safe operation, such as invalid `SKILL.md` files, broken symlinks, and provider state that conflicts with the discovered filesystem state.

**Update Opportunity**:
A known newer version for a managed Global Skill. It is useful action context, not evidence that the current skill is broken.
_Avoid_: Inventory Issue, stale skill warning

**Skill Group**:
A relationship object that collects Provider Instances believed to represent the same skill.
_Avoid_: Duplicate, provider row

**Inventory Row**:
The primary row in Skill Inventory. It should represent the object the user can inspect or act on directly.
_Avoid_: Abstract grouping, hidden provider selection

**Relationship-Aware Ordering**:
An inventory ordering model where Provider Instance rows remain individually actionable but related instances are kept near each other when possible.
_Avoid_: Provider partitioning, abstract group row

**Related Providers**:
The main-list hint that a Provider Instance has confirmed same-skill relationships in other providers. It should only be based on strong provenance evidence and should not include name-only matches.
_Avoid_: Duplicate badge, weak match count

**Skill Identity**:
The evidence Skillpack uses to decide which provider-specific instances belong to the same Skill Group.
_Avoid_: Display name, directory name

**Name-Only Relationship**:
A weak relationship between Provider Instances based only on normalized skill names, without path or source provenance confirming they are the same skill.
_Avoid_: Confirmed relationship, duplicate

**Disable Strategy**:
The provider-specific mechanism Skillpack uses to make a skill unavailable to an agent.
_Avoid_: Universal toggle, hidden directory rule
