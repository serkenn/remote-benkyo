"""events table の CRUD と filtering テスト."""

import pytest

from benkyo import repository as repo
from benkyo.errors import InvalidArgError, NotFoundError


class TestCreateEvent:
    def test_basic_create(self, conn):
        e = repo.create_event(
            conn,
            kind="session_start",
            payload={"learner": "default"},
        )
        assert e["id"] == "e1"
        assert e["kind"] == "session_start"
        assert e["payload"] == {"learner": "default"}
        assert e["project_id"] is None
        assert e["notes"] == ""
        assert "ts" in e

    def test_with_project(self, conn):
        repo.create_problem(conn, "p", "a")
        prj = repo.create_project(conn, "test")
        e = repo.create_event(
            conn,
            kind="session_end",
            project_id=prj["id"],
            payload={"completed": ["c1"]},
            notes="学習者は明日試験",
        )
        assert e["project_id"] == prj["id"]
        assert e["notes"] == "学習者は明日試験"
        assert e["payload"] == {"completed": ["c1"]}

    def test_empty_kind_rejected(self, conn):
        with pytest.raises(InvalidArgError):
            repo.create_event(conn, kind="")
        with pytest.raises(InvalidArgError):
            repo.create_event(conn, kind="   ")

    def test_non_dict_payload_rejected(self, conn):
        with pytest.raises(InvalidArgError):
            repo.create_event(conn, kind="x", payload="not a dict")  # type: ignore
        with pytest.raises(InvalidArgError):
            repo.create_event(conn, kind="x", payload=[1, 2, 3])  # type: ignore

    def test_project_id_must_exist(self, conn):
        with pytest.raises(NotFoundError):
            repo.create_event(conn, kind="x", project_id="prj999")

    def test_project_id_format_rejected(self, conn):
        with pytest.raises(InvalidArgError):
            repo.create_event(conn, kind="x", project_id="c1")

    def test_id_sequence(self, conn):
        ids = [repo.create_event(conn, kind="t")["id"] for _ in range(3)]
        assert ids == ["e1", "e2", "e3"]

    def test_unicode_payload_preserved(self, conn):
        e = repo.create_event(
            conn,
            kind="delayed_jol_recorded",
            payload={"claim": "高", "note": "ω 記号も OK"},
        )
        got = repo.get_event(conn, e["id"])
        assert got["payload"]["claim"] == "高"
        assert got["payload"]["note"] == "ω 記号も OK"


class TestGetEvent:
    def test_get_existing(self, conn):
        e = repo.create_event(conn, kind="x", payload={"k": 1})
        got = repo.get_event(conn, e["id"])
        assert got["id"] == e["id"]
        assert got["payload"] == {"k": 1}

    def test_get_not_found(self, conn):
        with pytest.raises(NotFoundError):
            repo.get_event(conn, "e999")


class TestListEvents:
    def test_empty(self, conn):
        assert repo.list_events(conn) == []

    def test_newest_first(self, conn):
        repo.create_event(conn, kind="a")
        repo.create_event(conn, kind="b")
        repo.create_event(conn, kind="c")
        kinds = [e["kind"] for e in repo.list_events(conn)]
        assert kinds == ["c", "b", "a"]

    def test_filter_by_project(self, conn):
        repo.create_problem(conn, "p", "a")
        prj = repo.create_project(conn, "test")
        repo.create_event(conn, kind="global")
        repo.create_event(conn, kind="local", project_id=prj["id"])

        local = repo.list_events(conn, project_id=prj["id"])
        assert len(local) == 1
        assert local[0]["kind"] == "local"

    def test_filter_by_kind(self, conn):
        repo.create_event(conn, kind="session_start")
        repo.create_event(conn, kind="session_end")
        repo.create_event(conn, kind="session_start")

        only_starts = repo.list_events(conn, kind="session_start")
        assert len(only_starts) == 2
        assert all(e["kind"] == "session_start" for e in only_starts)

    def test_limit(self, conn):
        for i in range(5):
            repo.create_event(conn, kind=f"k{i}")
        limited = repo.list_events(conn, limit=2)
        assert len(limited) == 2

    def test_negative_limit_rejected(self, conn):
        with pytest.raises(InvalidArgError):
            repo.list_events(conn, limit=0)
        with pytest.raises(InvalidArgError):
            repo.list_events(conn, limit=-1)


class TestDeleteEvent:
    def test_delete_existing(self, conn):
        e = repo.create_event(conn, kind="x")
        result = repo.delete_event(conn, e["id"])
        assert result["deleted_id"] == e["id"]
        with pytest.raises(NotFoundError):
            repo.get_event(conn, e["id"])

    def test_delete_not_found(self, conn):
        with pytest.raises(NotFoundError):
            repo.delete_event(conn, "e999")


class TestCascade:
    def test_event_deleted_when_project_deleted(self, conn):
        repo.create_problem(conn, "p", "a")
        prj = repo.create_project(conn, "test")
        repo.create_event(conn, kind="x", project_id=prj["id"])
        assert len(repo.list_events(conn, project_id=prj["id"])) == 1
        repo.delete_project(conn, prj["id"])
        assert repo.list_events(conn) == []
