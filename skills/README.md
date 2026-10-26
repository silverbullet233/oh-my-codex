# Standalone skills

Future reusable repository-wide skills belong at `skills/<skill-name>/SKILL.md`, with their own supporting files. No standalone skills are currently shipped.

Instructions specific to a plugin stay inside that plugin's `skills/` directory so installing its self-contained package includes them. The existing DSH skill is [bundled with dsh-agent-team](../plugins/dsh-agent-team/skills/dsh-agent-team/SKILL.md); it is not duplicated or implicitly installed from this directory.

Document new standalone skills in the root README catalog. Do not add placeholder skills, symlinks to plugin internals, or dependencies on the repository's checkout path.
