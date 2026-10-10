def pytest_addoption(parser):
    parser.addoption("--agent-root", default=None, help="Read-only agent checkout for real harness integration tests")
