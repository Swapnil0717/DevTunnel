import unittest

import sensitive as s


def rules(text):
    return [(f.rule, f.confidence) for f in s.detect(text)]


class DetectTests(unittest.TestCase):
    def test_known_token_formats(self):
        samples = {
            "aws_access_key": "AKIAABCDEFGHIJKLMNOP",
            "github_token": "ghp_" + "a1B2c3D4e5" * 4,
            "stripe_key": "sk_live_51Hn3k29fJ2mXaB9q",
            "slack_token": "xoxb-1234567890-abcdefghij",
            "jwt": "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
        }
        for name, tok in samples.items():
            self.assertEqual(rules(f"here {tok} there"), [(name, 0.98)], name)

    def test_private_key_block(self):
        pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----"
        self.assertEqual([r for r, _ in rules(pem)], ["private_key_block"])

    def test_placeholders_and_plain_words_are_not_secrets(self):
        for v in ("apiKey: <YOUR_API_KEY>", "token: ${TOKEN}", "token: expired_soon",
                  "secret: process.env.SECRET", "api_key: your_api_key_here"):
            self.assertEqual(rules(v), [], v)

    def test_strong_assignment_is_confident(self):
        self.assertEqual(rules("client_secret = 'Zx91!kQpL0aa72Ms'"), [("credential_assignment", 0.9)])

    def test_ambiguous_assignment_is_below_floor(self):
        (rule, conf), = rules("password: hunter2hunter")
        self.assertLess(conf, s.REDACTION_CONFIDENCE_FLOOR)

    def test_email_bots_and_system_users_ignored(self):
        self.assertEqual(rules("noreply@github.com"), [])
        self.assertEqual(rules("/home/runner/work/x.js and /Users/Shared/y"), [])
        self.assertEqual([r for r, _ in rules("bob@corp.com")], ["email"])

    def test_windows_home_path(self):
        new, applied, _ = s.redact(r"C:\Users\jdoe\proj\a.py")
        self.assertEqual(new, r"C:\Users\<REDACTED_USER>\proj\a.py")

    def test_connection_string(self):
        new, _, _ = s.redact("mongodb://root:pa55w0rd@host:27017/db")
        self.assertEqual(new, "mongodb://root:<REDACTED_SECRET>@host:27017/db")

    def test_url_param_does_not_swallow_neighbours(self):
        new, _, _ = s.redact("https://x.io/a?token=abcdef123456&page=2")
        self.assertEqual(new, "https://x.io/a?token=<REDACTED_SECRET>&page=2")


class RedactTests(unittest.TestCase):
    def test_returns_unresolved_and_leaves_them(self):
        text = "password: hunter2hunter and mail bob@corp.com"
        new, applied, unresolved = s.redact(text)
        self.assertIn("hunter2hunter", new)
        self.assertIn("<REDACTED_EMAIL>", new)
        self.assertEqual(len(unresolved), 1)

    def test_clean_text_unchanged(self):
        t = "Nothing sensitive: the request fails with a 500."
        self.assertEqual(s.redact(t), (t, [], []))

    def test_idempotent(self):
        once = s.redact("apiKey: sk_live_51Hn3k29fJ2mXaB9q")[0]
        self.assertEqual(s.redact(once)[0], once)


if __name__ == "__main__":
    unittest.main()
