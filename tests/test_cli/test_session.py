"""session CLI のテスト."""

import json

from tests.test_cli.conftest import parse_ok


def _setup_project(invoke):
    invoke("problem", "add", "--statement", "Q", "--answer", "A")
    invoke("project", "create", "--metadata", "test", "--goals", "p1")


def test_session_end_minimal(invoke):
    _setup_project(invoke)
    result = invoke("session", "end", "--project", "prj1", "--summary", "{}")
    data = parse_ok(result)
    assert data["session_end"]["kind"] == "session_end"
    assert data["delayed_jols"] == []


def test_session_end_with_full_summary(invoke):
    _setup_project(invoke)
    summary = json.dumps(
        {
            "completed_problems": ["p1"],
            "delayed_jols": [
                {"concept_id": "c1", "claim": "high"},
                {"concept_id": "c2", "claim": "low"},
            ],
            "notes": "疲れた",
        },
        ensure_ascii=False,
    )
    result = invoke("session", "end", "--project", "prj1", "--summary", summary)
    data = parse_ok(result)
    assert data["session_end"]["notes"] == "疲れた"
    assert len(data["delayed_jols"]) == 2


def test_session_end_requires_project(invoke):
    result = invoke("session", "end", "--summary", "{}", expect_ok=False)
    assert result.exit_code != 0


def test_session_end_missing_project_fails(invoke):
    result = invoke(
        "session", "end",
        "--project", "prj999",
        "--summary", "{}",
        expect_ok=False,
    )
    assert result.exit_code != 0


def test_session_end_invalid_json(invoke):
    _setup_project(invoke)
    result = invoke(
        "session", "end",
        "--project", "prj1",
        "--summary", "not-json",
        expect_ok=False,
    )
    assert result.exit_code != 0


def test_schema_command(invoke):
    result = invoke("schema")
    data = parse_ok(result)
    assert "version" in data
    assert data["cli"]["name"] == "cli"
    subs = data["cli"]["subcommands"]
    assert "events" in subs
    assert "session" in subs
    assert "schema" in subs
    # session subcommand discoverable
    assert "end" in subs["session"]["subcommands"]
