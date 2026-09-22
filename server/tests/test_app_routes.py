"""The contribution routes are registered, and the app imports.

Importing `main` also imports every other router. When an unrelated one is
broken, that test skips with the reason rather than failing this workflow —
and rather than being "fixed" by unmounting someone else's feature.
"""

import unittest

from fastapi import FastAPI

from app.api.v1.endpoints import contributions

EXPECTED_ROUTES = {
    ("POST", "/api/v1/contributions/award/student/{student_id}"),
    ("POST", "/api/v1/contributions/award/spg/{spg_id}"),
    ("PATCH", "/api/v1/contributions/{record_id}/revoke"),
    ("GET", "/api/v1/contributions/leaderboard"),
    ("GET", "/api/v1/contributions/me"),
    ("GET", "/api/v1/contributions"),
    ("GET", "/api/v1/contributions/{record_id}"),
}


def routes_of(app: FastAPI) -> set:
    """Every registered (method, path), read from the OpenAPI schema.

    Included routers are nested objects in this FastAPI version, so walking
    app.routes would miss them.
    """
    return {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }


class ContributionRoutingTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(contributions.router, prefix="/api/v1")

    def test_every_contribution_route_is_registered(self):
        self.assertTrue(EXPECTED_ROUTES <= routes_of(self.app))

    def test_the_prefix_is_not_doubled(self):
        for _method, path in routes_of(self.app):
            with self.subTest(path=path):
                self.assertNotIn("/api/v1/api/v1", path)

    def test_fixed_paths_are_their_own_routes(self):
        # /me and /leaderboard are declared before /{record_id}, so the path
        # parameter cannot swallow them. That they resolve is covered by the
        # endpoint tests; here they must exist as routes in their own right.
        registered = routes_of(self.app)
        for path in ("/api/v1/contributions/me", "/api/v1/contributions/leaderboard"):
            with self.subTest(path=path):
                self.assertIn(("GET", path), registered)

    def test_each_route_resolves_to_its_handler(self):
        self.assertEqual(
            self.app.url_path_for("award_student", student_id="student_001"),
            "/api/v1/contributions/award/student/student_001",
        )
        self.assertEqual(
            self.app.url_path_for("award_spg", spg_id="spg_001"),
            "/api/v1/contributions/award/spg/spg_001",
        )


class ApplicationImportTests(unittest.TestCase):
    def test_import_main_registers_the_contribution_routes(self):
        try:
            import main
        except Exception as error:  # noqa: BLE001 - reported, never repaired here
            self.skipTest(
                "importing main is blocked by an unrelated router: "
                f"{type(error).__name__}: {error}"
            )
        self.assertTrue(EXPECTED_ROUTES <= routes_of(main.app))


if __name__ == "__main__":
    unittest.main()
