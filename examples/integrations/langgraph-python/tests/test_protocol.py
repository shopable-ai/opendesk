from __future__ import annotations

import unittest

from protocol import (
    ProtocolError,
    new_request,
    success_response,
    validate_increment,
    validate_request,
    validate_response,
)


class ProtocolTests(unittest.TestCase):
    def test_request_round_trip(self) -> None:
        request = new_request({"minimum": 5, "maximum": 15}, request_id="req-1")
        self.assertEqual(validate_request(request)["requestId"], "req-1")

    def test_request_rejects_unknown_field(self) -> None:
        request = new_request({}, request_id="req-1")
        request["unexpected"] = True
        with self.assertRaises(ProtocolError):
            validate_request(request)

    def test_response_rejects_request_id_mismatch(self) -> None:
        response = success_response("req-1", {"value": 8})
        with self.assertRaises(ProtocolError):
            validate_response(response, request_id="req-2")

    def test_increment_is_strict_integer(self) -> None:
        self.assertEqual(validate_increment(5), 5)
        self.assertEqual(validate_increment(15), 15)
        for bad in ("12", 8.5, True, 4, 16):
            with self.subTest(bad=bad):
                with self.assertRaises(ProtocolError):
                    validate_increment(bad)


if __name__ == "__main__":
    unittest.main()
