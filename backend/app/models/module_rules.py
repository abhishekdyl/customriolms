"""
SUPERSEDED — not a separate table, same reasoning as course_rules.py.
A module's completion rule (type, threshold, required, which skills/
badges it grants) is just that module's own config, not a distinct
relationship. Lives directly on Module — see app/models/module.py.
"""
