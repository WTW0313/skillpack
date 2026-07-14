# Decouple Claude usage from inventory state

Claude Skill Usage Import will run after Usage Import Consent even when the Claude Skill Inventory provider is disabled. Inventory availability and runtime usage are separate facts, so the usage adapter will use its configured Usage Artifact Roots and Skill Attribution Roots directly; missing roots produce `not-configured` coverage with all applicable Usage Coverage Reasons rather than silently reporting zero usage.

Current Skill Availability also does not filter source candidates during historical attribution. Disabled user-level skills and disabled plugins remain eligible while their source content exists, because disabling content now must not erase evidence of earlier use.
