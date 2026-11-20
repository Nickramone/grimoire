"""Members' notes on a wiki page (WikiAnnotation): written by anyone who can read
the page, stored beside it, seen according to their own visibility."""
import uuid

import pytest


def uid():
    return uuid.uuid4().hex[:8]


def _user(client, admin_headers, role="player"):
    name = f"ann{uid()}"
    created = client.post(
        "/api/users",
        json={"username": name, "password": "annpass12345", "role": role},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    login = client.post("/api/auth/login", json={"username": name, "password": "annpass12345"})
    assert login.status_code == 200, login.text
    return created.json()["id"], {"Authorization": f"Bearer {login.json()['token']}"}


def _join(client, gm_headers, cid, user_id, headers):
    client.post(f"/api/campaigns/{cid}/invite", json={"user_id": user_id}, headers=gm_headers)
    resp = client.patch(
        f"/api/campaigns/{cid}/members/{user_id}", json={"status": "accepted"}, headers=headers
    )
    assert resp.status_code == 200, resp.text


@pytest.fixture()
def table(client, admin_headers, gm_headers, player_headers, player_id):
    """A GM campaign with two players and an admin among its members, and a page
    the players can read but not edit (the shape of a published page)."""
    c = client.post(
        "/api/campaigns", json={"name": f"Ann {uid()}", "is_gm_campaign": True}, headers=gm_headers
    ).json()
    cid = c["id"]
    _join(client, gm_headers, cid, player_id, player_headers)
    other_id, other_headers = _user(client, admin_headers)
    _join(client, gm_headers, cid, other_id, other_headers)
    adm_id, adm_headers = _user(client, admin_headers, role="admin")
    _join(client, gm_headers, cid, adm_id, adm_headers)
    page = client.post(
        f"/api/campaigns/{cid}/wiki",
        json={
            "title": "Bryn Shander",
            "body": "The largest of Ten-Towns.",
            "visibility": "members",
            "shared_user_ids": [player_id, other_id, adm_id],
        },
        headers=gm_headers,
    ).json()
    return {
        "cid": cid,
        "page": page["id"],
        "gm": gm_headers,
        "player": player_headers,
        "other": other_headers,
        "admin": adm_headers,
        "readers": [player_id, other_id, adm_id],
    }


def _url(t, ann_id=None):
    base = f"/api/campaigns/{t['cid']}/wiki/{t['page']}/annotations"
    return f"{base}/{ann_id}" if ann_id else base


def _note(client, t, who="player", **body):
    body.setdefault("body", "Speaker Duvessa seems nervous.")
    resp = client.post(_url(t), json=body, headers=t[who])
    assert resp.status_code == 201, resp.text
    return resp.json()


def _bodies(client, t, who):
    resp = client.get(_url(t), headers=t[who])
    assert resp.status_code == 200, resp.text
    return [a["body"] for a in resp.json()]


def test_reader_annotates_a_page_they_cannot_edit(client, table):
    t = table
    page = client.get(f"/api/campaigns/{t['cid']}/wiki/{t['page']}", headers=t["player"]).json()
    assert page["can_edit"] is False
    a = _note(client, t)
    assert a["visibility"] == "party"  # the default
    assert a["is_mine"] and a["can_edit"] and not a["can_hide"]
    assert a["author_name"]
    # The page itself is untouched.
    after = client.get(f"/api/campaigns/{t['cid']}/wiki/{t['page']}", headers=t["gm"]).json()
    assert after["body"] == "The largest of Ten-Towns."


def test_text_is_trimmed_and_required(client, table):
    t = table
    assert _note(client, t, body="  ask the GM  ")["body"] == "ask the GM"
    assert client.post(_url(t), json={"body": "   "}, headers=t["player"]).status_code == 400
    assert client.post(_url(t), json={"body": ""}, headers=t["player"]).status_code == 422


def test_unknown_visibility_is_refused(client, table):
    resp = client.post(_url(table), json={"body": "x", "visibility": "everyone"}, headers=table["player"])
    assert resp.status_code == 400


def test_a_page_you_cannot_read_takes_no_notes(client, table, admin_headers):
    t = table
    hidden = client.post(
        f"/api/campaigns/{t['cid']}/wiki",
        json={"title": "GM plans", "visibility": "gm"},
        headers=t["gm"],
    ).json()
    url = f"/api/campaigns/{t['cid']}/wiki/{hidden['id']}/annotations"
    assert client.post(url, json={"body": "x"}, headers=t["player"]).status_code == 404
    assert client.get(url, headers=t["player"]).status_code == 404
    _, outsider = _user(client, admin_headers)
    assert client.get(_url(t), headers=outsider).status_code in (403, 404)


def test_survives_a_rewrite_of_the_page(client, table):
    t = table
    _note(client, t)
    resp = client.patch(
        f"/api/campaigns/{t['cid']}/wiki/{t['page']}", json={"body": "Rewritten."}, headers=t["gm"]
    )
    assert resp.status_code == 200, resp.text
    assert _bodies(client, t, "player") == ["Speaker Duvessa seems nervous."]


def test_ordered_oldest_first(client, table):
    t = table
    _note(client, t, body="first")
    _note(client, t, who="other", body="second")
    assert _bodies(client, t, "gm") == ["first", "second"]


class TestVisibility:
    def test_party_note_is_read_by_everyone_on_the_page(self, client, table):
        _note(client, table, body="party")
        for who in ("player", "other", "gm", "admin"):
            assert _bodies(client, table, who) == ["party"], who

    def test_gm_note_is_read_by_author_gm_and_admin(self, client, table):
        _note(client, table, body="for the GM", visibility="gm")
        assert _bodies(client, table, "player") == ["for the GM"]
        assert _bodies(client, table, "gm") == ["for the GM"]
        assert _bodies(client, table, "admin") == ["for the GM"]
        assert _bodies(client, table, "other") == []

    def test_self_note_is_read_by_author_and_admin_only(self, client, table):
        _note(client, table, body="mine", visibility="self")
        assert _bodies(client, table, "player") == ["mine"]
        assert _bodies(client, table, "admin") == ["mine"]
        assert _bodies(client, table, "gm") == []
        assert _bodies(client, table, "other") == []

    def test_an_unseen_note_answers_404(self, client, table):
        a = _note(client, table, visibility="self")
        assert client.patch(_url(table, a["id"]), json={"body": "x"}, headers=table["other"]).status_code == 404
        assert client.delete(_url(table, a["id"]), headers=table["gm"]).status_code == 404

    def test_retracted_page_hides_its_notes_until_shared_again(self, client, table):
        t = table
        _note(client, t, body="kept")
        page_url = f"/api/campaigns/{t['cid']}/wiki/{t['page']}"
        assert client.patch(page_url, json={"visibility": "gm"}, headers=t["gm"]).status_code == 200
        assert client.get(_url(t), headers=t["player"]).status_code == 404
        assert _bodies(client, t, "gm") == ["kept"]
        resp = client.patch(
            page_url,
            json={"visibility": "members", "shared_user_ids": t["readers"]},
            headers=t["gm"],
        )
        assert resp.status_code == 200, resp.text
        assert _bodies(client, t, "player") == ["kept"]


class TestEditing:
    def test_author_edits_text_and_visibility(self, client, table):
        a = _note(client, table)
        resp = client.patch(
            _url(table, a["id"]), json={"body": "edited", "visibility": "self"}, headers=table["player"]
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["body"] == "edited" and resp.json()["visibility"] == "self"
        assert _bodies(client, table, "other") == []

    def test_others_cannot_edit_or_delete(self, client, table):
        a = _note(client, table)
        for who in ("other", "gm", "admin"):
            assert client.patch(_url(table, a["id"]), json={"body": "x"}, headers=table[who]).status_code == 403
            assert client.delete(_url(table, a["id"]), headers=table[who]).status_code == 403

    def test_author_deletes(self, client, table):
        a = _note(client, table)
        assert client.delete(_url(table, a["id"]), headers=table["player"]).status_code == 204
        assert _bodies(client, table, "gm") == []

    def test_deleting_the_page_deletes_its_notes(self, client, table):
        a = _note(client, table)
        page_url = f"/api/campaigns/{table['cid']}/wiki/{table['page']}"
        assert client.delete(page_url, headers=table["gm"]).status_code == 204
        assert client.get(_url(table), headers=table["gm"]).status_code == 404
        from backend.config import SessionLocal
        from backend.models import WikiAnnotation

        with SessionLocal() as db:
            assert db.query(WikiAnnotation).filter_by(id=a["id"]).first() is None


class TestHiding:
    def test_gm_hides_a_party_note_from_the_party(self, client, table):
        a = _note(client, table, body="rude")
        assert a["can_hide"] is False
        gm_view = client.get(_url(table), headers=table["gm"]).json()[0]
        assert gm_view["can_hide"] is True
        resp = client.patch(_url(table, a["id"]), json={"hidden_by_gm": True}, headers=table["gm"])
        assert resp.status_code == 200 and resp.json()["hidden_by_gm"] is True
        assert _bodies(client, table, "other") == []
        assert _bodies(client, table, "player") == ["rude"]  # its author still sees it
        assert _bodies(client, table, "gm") == ["rude"]
        assert _bodies(client, table, "admin") == ["rude"]
        client.patch(_url(table, a["id"]), json={"hidden_by_gm": False}, headers=table["gm"])
        assert _bodies(client, table, "other") == ["rude"]

    def test_players_cannot_hide(self, client, table):
        a = _note(client, table)
        resp = client.patch(_url(table, a["id"]), json={"hidden_by_gm": True}, headers=table["other"])
        assert resp.status_code == 403
        resp = client.patch(_url(table, a["id"]), json={"hidden_by_gm": True}, headers=table["player"])
        assert resp.status_code == 403

    def test_only_party_notes_can_be_hidden(self, client, table):
        a = _note(client, table, visibility="gm")
        resp = client.patch(_url(table, a["id"]), json={"hidden_by_gm": True}, headers=table["gm"])
        assert resp.status_code == 403
