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

**Project Skill**:
A skill stored inside a project repository and maintained by that repository's authors through git.
_Avoid_: Global Skill, managed skill

**skills.sh**:
The external skill ecosystem and CLI used for installing, updating, and removing Global Skills.
_Avoid_: GitHub install source, package manager

**Unmanaged On-Disk Skill**:
A discovered skill whose source is not identified from skills.sh metadata. These skills may live in Codex, Claude, Global, or Project skill directories, but Skillpack treats their content as provider-owned or repository-owned.
_Avoid_: Installed skill, Skillpack-created skill

**Skill Inventory**:
The cross-provider view of discovered skills, their provenance, availability, and health.
_Avoid_: Skill editor, authoring workspace

**Health Signal**:
A deterministic inventory finding that helps the user understand a skill's provider coverage, provenance, or loadability.
_Avoid_: Security score, quality rating

**Skill Group**:
The inventory row that collects provider-specific instances believed to represent the same skill.
_Avoid_: Duplicate, provider row

**Skill Identity**:
The evidence Skillpack uses to decide which provider-specific instances belong to the same Skill Group.
_Avoid_: Display name, directory name

**Disable Strategy**:
The provider-specific mechanism Skillpack uses to make a skill unavailable to an agent.
_Avoid_: Universal toggle, hidden directory rule
