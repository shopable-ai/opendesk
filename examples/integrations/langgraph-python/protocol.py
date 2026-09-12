"""Strict JSON contract shared by the OpenDesk/LangGraph integration examples."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping
import uuid

SCHEMA_VERSION = 1
REQUEST_KEYS = frozenset({"schemaVersion", "requestId", "data", "meta"})
RESPONSE_KEYS = frozenset({"schemaVersion", "requestId", "ok", "data", "error"})


class ProtocolError(ValueError):
    """Raised when an external workflow message violates the bridge contract."""


@dataclass(frozen=True)
class Response:
    request_id: str
    data: dict[str, Any]


def _require_object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolError(f"{name} must be a JSON object")
    return value


def _reject_unknown_keys(value: Mapping[str, Any], allowed: frozenset[str], name: str) -> None:
    unknown = set(value) - set(allowed)
    if unknown:
        raise ProtocolError(f"{name} has unknown fields: {', '.join(sorted(unknown))}")


def _require_request_id(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 256:
        raise ProtocolError("requestId must be a non-empty string no longer than 256 characters")
    return value


def new_request(data: Mapping[str, Any], *, request_id: str | None = None,
                meta: Mapping[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(data, Mapping):
        raise ProtocolError("data must be a JSON object")
    rid = request_id or str(uuid.uuid4())
    _require_request_id(rid)
    request: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "requestId": rid,
        "data": dict(data),
    }
    if meta is not None:
        if not isinstance(meta, Mapping):
            raise ProtocolError("meta must be a JSON object")
        request["meta"] = dict(meta)
    return request


def validate_request(value: Any) -> dict[str, Any]:
    request = _require_object(value, "request")
    _reject_unknown_keys(request, REQUEST_KEYS, "request")
    if request.get("schemaVersion") != SCHEMA_VERSION:
        raise ProtocolError(f"schemaVersion must be {SCHEMA_VERSION}")
    _require_request_id(request.get("requestId"))
    _require_object(request.get("data"), "request.data")
    if "meta" in request:
        _require_object(request["meta"], "request.meta")
    return request


def success_response(request_id: str, data: Mapping[str, Any]) -> dict[str, Any]:
    _require_request_id(request_id)
    if not isinstance(data, Mapping):
        raise ProtocolError("response data must be a JSON object")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "requestId": request_id,
        "ok": True,
        "data": dict(data),
        "error": None,
    }


def error_response(request_id: str, code: str, message: str) -> dict[str, Any]:
    _require_request_id(request_id)
    if not isinstance(code, str) or not code:
        raise ProtocolError("error code must be a non-empty string")
    if not isinstance(message, str) or not message:
        raise ProtocolError("error message must be a non-empty string")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "requestId": request_id,
        "ok": False,
        "data": None,
        "error": {"code": code, "message": message},
    }


def validate_response(value: Any, *, request_id: str) -> Response:
    response = _require_object(value, "response")
    _reject_unknown_keys(response, RESPONSE_KEYS, "response")
    if set(response) != RESPONSE_KEYS:
        missing = RESPONSE_KEYS - set(response)
        raise ProtocolError(f"response is missing fields: {', '.join(sorted(missing))}")
    if response.get("schemaVersion") != SCHEMA_VERSION:
        raise ProtocolError(f"schemaVersion must be {SCHEMA_VERSION}")
    if response.get("requestId") != request_id:
        raise ProtocolError("response requestId does not match request")
    if type(response.get("ok")) is not bool:
        raise ProtocolError("response.ok must be a boolean")
    if response["ok"] is not True:
        error = _require_object(response.get("error"), "response.error")
        code = error.get("code")
        message = error.get("message")
        if not isinstance(code, str) or not code or not isinstance(message, str) or not message:
            raise ProtocolError("response.error must contain non-empty code and message")
        raise ProtocolError(f"worker failed: {code}: {message}")
    data = _require_object(response.get("data"), "response.data")
    if response.get("error") is not None:
        raise ProtocolError("successful response.error must be null")
    return Response(request_id=request_id, data=data)


def validate_increment(value: Any, *, minimum: int = 5, maximum: int = 15) -> int:
    if type(value) is not int:
        raise ProtocolError("increment must be an integer")
    if value < minimum or value > maximum:
        raise ProtocolError(f"increment must be between {minimum} and {maximum}")
    return value
