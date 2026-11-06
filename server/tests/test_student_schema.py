"""Verification that legacy Student models are properly unified into User schemas."""

import unittest
from app.schemas.users import UserDocument, UserPublicResponse, UserMeResponse


class StudentLegacyPlaceholderTests(unittest.TestCase):
    def test_student_models_unified(self):
        # Student models were unified into User models; verify models are present and valid
        self.assertIn("batch_year", UserDocument.model_fields)
        self.assertIn("skills", UserDocument.model_fields)
        self.assertIn("points", UserDocument.model_fields)
        self.assertIn("tier", UserMeResponse.model_fields)
        self.assertIn("full_name", UserPublicResponse.model_fields)


if __name__ == "__main__":
    unittest.main()

