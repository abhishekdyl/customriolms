"""Phone-number normalization/validation — shared by every place a
User.phone is written (registration, profile edit, admin user edit) and
by whatsapp_service before it ever tries to send someone a message.

Deliberately lightweight (no external phonenumbers/libphonenumber
dependency) — this only needs to produce a consistent, WhatsApp-sendable
E.164-ish shape ("+<countrycode><number>", digits only after the +), not
validate real-world dialling-plan correctness per country."""
import re

# A WhatsApp "to" number is the E.164 digits with no leading "+" (see
# SendZen's own `from`/`to` convention) — 8 to 15 digits total is E.164's
# own length bound (ITU-T E.164 recommendation).
_MIN_DIGITS = 8
_MAX_DIGITS = 15


def normalize_phone(raw: str | None) -> str | None:
    """Strips everything but digits and a leading "+", so "+91 98765-43210",
    "(+91) 98765 43210" and "919876543210" all end up as one consistent
    shape. Returns None for a blank/whitespace-only input (so callers can
    tell "no phone" apart from "a phone string"), but otherwise never
    rejects — an out-of-range or oddly-shaped result is still stored as
    typed (just cleaned up); whether it's usable for actually sending a
    WhatsApp message is a separate, stricter question (see is_valid_e164/
    whatsapp_service's own check), not something profile-editing should
    block on."""
    if raw is None:
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    has_plus = stripped.startswith("+")
    digits = re.sub(r"\D", "", stripped)
    if not digits:
        return None
    return f"+{digits}" if has_plus else digits


def is_valid_e164(phone: str | None) -> bool:
    """Strict check used right before a WhatsApp send is attempted —
    is this a plausible E.164 number at all (leading "+", 8-15 digits,
    no leading zero after the country code)? Deliberately doesn't check
    the number actually exists/is reachable; that's what the provider's
    own delivery-status webhook is for."""
    if not phone:
        return False
    if not phone.startswith("+"):
        return False
    digits = phone[1:]
    if not digits.isdigit():
        return False
    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        return False
    return digits[0] != "0"


def whatsapp_recipient(phone: str | None) -> str | None:
    """The "to" shape SendZen/WhatsApp Cloud API expects: E.164 digits,
    no leading "+". Returns None when `phone` isn't usable at all (see
    is_valid_e164) — the caller's cue to skip and log why."""
    if not is_valid_e164(phone):
        return None
    return phone[1:]
