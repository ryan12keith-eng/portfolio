"""Router tests: no database or API key needed (Claude is replaced with a fake client)."""
from types import SimpleNamespace

import pytest

from app import assistant
from app.assistant import Intent, parse_question


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("Show me all schools within 5 km of this location", Intent(type="within", kind="school", radius_m=5000)),
        ("hospitals within 2 miles", Intent(type="within", kind="hospital", radius_m=3219)),
        ("Where is the nearest hospital?", Intent(type="nearest", kind="hospital")),
        ("Which areas lack a school within 1.5 km?", Intent(type="gaps", kind="school", radius_m=1500)),
        ("Where are parks most concentrated?", Intent(type="density", kind="park")),
        ("How many libraries are there?", Intent(type="count", kind="library")),
        ("Which fire stations are near a river?", Intent(type="flood", kind="fire_station", buffer_m=300)),
    ],
)
def test_rule_based_router(question, expected):
    assert parse_question(question) == expected


def test_refuses_questions_without_data():
    assert parse_question("What is the population within 2 km?").type == "unsupported"
    assert parse_question("tell me a joke").type == "unknown"


def fake_client(monkeypatch, response=None, error=None):
    import anthropic

    class FakeMessages:
        def create(self, **kwargs):
            FakeMessages.kwargs = kwargs
            if error:
                raise error
            return response

    class FakeClient:
        def __init__(self, **_):
            self.beta = SimpleNamespace(messages=FakeMessages())

    monkeypatch.setattr(anthropic, "Anthropic", FakeClient)
    monkeypatch.setattr(assistant.settings.__class__, "anthropic_api_key", property(lambda self: "test-key"), raising=False)
    return FakeMessages


def tool_use(name, **args):
    return SimpleNamespace(stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", name=name, input=args)])


def test_claude_tool_call_maps_to_intent(monkeypatch):
    msgs = fake_client(monkeypatch, tool_use("find_within", kind="school", radius_m=5000))
    assert assistant.route_with_claude("schools within 5 km") == Intent(type="within", kind="school", radius_m=5000)
    sent = msgs.kwargs
    assert sent["model"] == "claude-opus-5-5"
    assert all(t["strict"] and t["input_schema"]["additionalProperties"] is False for t in sent["tools"])
    assert sent["fallbacks"] == "default"


def test_claude_all_kind_and_cannot_answer(monkeypatch):
    fake_client(monkeypatch, tool_use("find_density", kind="all"))
    assert assistant.route_with_claude("where is everything dense") == Intent(type="density", kind=None)
    fake_client(monkeypatch, tool_use("cannot_answer", reason="No elevation data"))
    assert assistant.route_with_claude("how high is it") == Intent(type="unsupported", reason="No elevation data")


def test_claude_errors_fall_back_to_rules(monkeypatch):
    import anthropic
    import httpx

    fake_client(monkeypatch, error=anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com")))
    assert assistant.route_with_claude("schools within 5 km") is None
    fake_client(monkeypatch, SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="hi")]))
    assert assistant.route_with_claude("hello") is None


def test_out_of_range_tool_args_are_rejected(monkeypatch):
    fake_client(monkeypatch, tool_use("find_within", kind="school", radius_m=9_999_999))
    assert assistant.route_with_claude("schools within the world") is None
