"""events CLI のテスト."""

import json

from tests.test_cli.conftest import parse_ok


def test_add_minimal(invoke):
    result = invoke("events", "add", "--kind", "session_start")
    data = parse_ok(result)
    assert data["id"] == "e1"
    assert data["kind"] == "session_start"
    assert data["payload"] == {}
    assert data["project_id"] is None


def test_add_with_payload_and_notes(invoke):
    result = invoke(
        "events", "add",
        "--kind", "delayed_jol_recorded",
        "--payload", '{"concept_id": "c1", "claim": "high"}',
        "--notes", "学習者の宣言, 翌日 probe で確認予定",
    )
    data = parse_ok(result)
    assert data["payload"] == {"concept_id": "c1", "claim": "high"}
    assert data["notes"] == "学習者の宣言, 翌日 probe で確認予定"


def test_add_with_project(invoke):
    invoke("problem", "add", "--statement", "Q", "--answer", "A")
    invoke("project", "create", "--metadata", "test", "--goals", "p1")
    result = invoke(
        "events", "add",
        "--kind", "session_end",
        "--project", "prj1",
        "--payload", '{"completed": []}',
    )
    data = parse_ok(result)
    assert data["project_id"] == "prj1"


def test_add_invalid_json_payload(invoke):
    result = invoke(
        "events", "add",
        "--kind", "x",
        "--payload", "not-json",
        expect_ok=False,
    )
    assert result.exit_code != 0


def test_list_newest_first(invoke):
    invoke("events", "add", "--kind", "first")
    invoke("events", "add", "--kind", "second")
    invoke("events", "add", "--kind", "third")
    result = invoke("events", "list")
    data = json.loads(result.output)
    kinds = [e["kind"] for e in data["result"]]
    assert kinds == ["third", "second", "first"]
    assert data["count"] == 3


def test_list_filter_by_kind(invoke):
    invoke("events", "add", "--kind", "a")
    invoke("events", "add", "--kind", "b")
    invoke("events", "add", "--kind", "a")
    result = invoke("events", "list", "--kind", "a")
    data = parse_ok(result)
    assert len(data) == 2
    assert all(e["kind"] == "a" for e in data)


def test_list_limit(invoke):
    for i in range(5):
        invoke("events", "add", "--kind", f"k{i}")
    result = invoke("events", "list", "--limit", "2")
    data = parse_ok(result)
    assert len(data) == 2


def test_get(invoke):
    invoke("events", "add", "--kind", "x", "--notes", "hello")
    result = invoke("events", "get", "e1")
    data = parse_ok(result)
    assert data["notes"] == "hello"


def test_delete(invoke):
    invoke("events", "add", "--kind", "x")
    invoke("events", "delete", "e1")
    result = invoke("events", "list")
    assert parse_ok(result) == []


def test_payload_unicode_roundtrip(invoke):
    invoke(
        "events", "add",
        "--kind", "x",
        "--payload", json.dumps({"comment": "ω 記号, e^(-st), 〆切"}),
    )
    result = invoke("events", "get", "e1")
    data = parse_ok(result)
    assert data["payload"]["comment"] == "ω 記号, e^(-st), 〆切"
