"""Optional plain-language summary of a site, written by Claude from measured facts only.
Used only when ANTHROPIC_API_KEY is set; otherwise reports use the rule-based assessment alone."""
import json
import logging

from .config import settings
from .scoring import Metrics, Target, assess

log = logging.getLogger(__name__)

SYSTEM = (
    "You write a 3-4 sentence development summary of a land site for a real-estate analyst. "
    "Use ONLY the facts in the JSON you are given. Do not invent zoning rules, prices, slopes, utilities or "
    "anything else that is not present. Mention the biggest opportunity, the biggest constraint, and what still needs checking."
)


def summarize(m: Metrics, score: dict, target: Target) -> str | None:
    if not settings.anthropic_api_key:
        return None
    import anthropic  # imported lazily so the default mode needs no SDK

    facts = {"site": m, "target_use": target, "score": score, "assessment": assess(m, score, target)}
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=1, timeout=60)
    try:
        response = client.beta.messages.create(
            model=settings.claude_model,
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(facts)}],
        )
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; report saved without summary")
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s; report saved without summary", e.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("Claude unreachable; report saved without summary")
        return None
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None
