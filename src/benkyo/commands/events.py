"""events subcommand: append-only log of state changes."""

import json

import click

from benkyo import repository as repo
from benkyo._db import get_conn
from benkyo._input import resolve_text
from benkyo._output import handle_errors, output_ok


@click.group(name="events")
def events_group():
    """Manage the append-only events log.

    Records time-stamped state changes (session_start, session_end,
    delayed_jol_recorded, hypercorrection_detected, treatment_changed,
    concept_probed). Skills query this log to do cross-session reasoning
    (delayed-JOL verification, hypercorrection re-probing, mastery tracking).
    """


def _parse_payload(payload: str | None, payload_file: str | None) -> dict:
    text = resolve_text(payload, payload_file)
    if text is None:
        return {}
    text = text.strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise click.UsageError(f"invalid JSON payload: {e}") from e
    if not isinstance(data, dict):
        raise click.UsageError("payload must be a JSON object")
    return data


@events_group.command(name="add")
@click.option("--kind", required=True, help="Event kind (e.g. session_end, delayed_jol_recorded)")
@click.option("--project", "project_id", default=None, help="Project id (omit for global event)")
@click.option("--payload", default=None, help="JSON object literal. Pass '-' to read from stdin")
@click.option("--payload-file", default=None, type=click.Path(), help="Read JSON payload from file")
@click.option("--notes", default="", help="Free-text annotation that doesn't fit the payload schema")
@click.pass_context
@handle_errors
def add(ctx, kind, project_id, payload, payload_file, notes):
    """Append an event to the log."""
    payload_dict = _parse_payload(payload, payload_file)
    output_ok(
        repo.create_event(
            get_conn(ctx),
            kind=kind,
            payload=payload_dict,
            project_id=project_id,
            notes=notes,
        )
    )


@events_group.command(name="get")
@click.argument("event_id")
@click.pass_context
@handle_errors
def get(ctx, event_id):
    """Get an event by id."""
    output_ok(repo.get_event(get_conn(ctx), event_id))


@events_group.command(name="list")
@click.option("--project", "project_id", default=None, help="Filter by project id")
@click.option("--kind", default=None, help="Filter by exact event kind")
@click.option("--since", default=None, help="ISO 8601 lower bound on ts (inclusive)")
@click.option("--until", default=None, help="ISO 8601 upper bound on ts (inclusive)")
@click.option("--limit", default=None, type=int, help="Max rows returned")
@click.pass_context
@handle_errors
def list_cmd(ctx, project_id, kind, since, until, limit):
    """List events, newest first."""
    items = repo.list_events(
        get_conn(ctx),
        project_id=project_id,
        kind=kind,
        since=since,
        until=until,
        limit=limit,
    )
    output_ok(items, count=len(items))


@events_group.command(name="delete")
@click.argument("event_id")
@click.pass_context
@handle_errors
def delete(ctx, event_id):
    """Delete an event by id (for correcting mis-logged entries)."""
    output_ok(repo.delete_event(get_conn(ctx), event_id))
