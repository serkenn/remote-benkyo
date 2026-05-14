"""session subcommand: high-level atomic operations on the events log.

These are convenience wrappers that bundle multiple primitive events into a
single transaction. Skills should prefer these over composing `events add`
sequences themselves — partial-failure on the primitive form would leave the
log inconsistent.
"""

import json

import click

from benkyo import repository as repo
from benkyo._db import get_conn
from benkyo._input import resolve_text
from benkyo._output import handle_errors, output_ok


@click.group(name="session")
def session_group():
    """High-level atomic session operations."""


def _parse_summary(summary: str | None, summary_file: str | None) -> dict:
    text = resolve_text(summary, summary_file)
    if text is None or not text.strip():
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise click.UsageError(f"invalid JSON summary: {e}") from e
    if not isinstance(data, dict):
        raise click.UsageError("summary must be a JSON object")
    return data


@session_group.command(name="end")
@click.option("--project", "project_id", required=True, help="Project id")
@click.option(
    "--summary",
    default=None,
    help='JSON object literal. Pass "-" to read from stdin.',
)
@click.option(
    "--summary-file",
    default=None,
    type=click.Path(),
    help="Read JSON summary from file.",
)
@click.pass_context
@handle_errors
def end(ctx, project_id, summary, summary_file):
    """Atomically record session end + one event per delayed JOL seed.

    The summary JSON should contain (all optional):

        - completed_problems: list of problem ids finished this session
        - treatment_changes: list of {concept_id, from, to}
        - pending: list of items left mid-progress
        - delayed_jols: list of {concept_id, claim, note?}
                        each becomes a separate delayed_jol_recorded event
        - notes: free-text annotation for the session_end event

    All writes happen in one transaction; on any error, nothing is recorded.
    """
    summary_dict = _parse_summary(summary, summary_file)
    output_ok(
        repo.record_session_end(
            get_conn(ctx),
            project_id=project_id,
            summary=summary_dict,
        )
    )
