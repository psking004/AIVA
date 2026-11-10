from sse.plugins.base import PluginMetadata, SSEPlugin
from sse.plugins.loader import PluginLoader
from sse.sdk.client import SSEClient
from sse.storage.filesystem import FileSystemStorage, StorageConfig
from sse.storage.repository import GameRepository


def test_sdk_client_end_to_end(tmp_path):
    client = SSEClient()
    game = client.create_game(
        id="sdk_test",
        name="SDK Test Game",
        players=["P1", "P2"],
        actions={"P1": ["C", "D"], "P2": ["C", "D"]},
        payoffs=[[3, 3], [0, 5], [5, 0], [1, 1]],
    )
    val = client.validate_game(game)
    assert val["status"] == "valid"

    # Solve
    result = client.solve(game, solver="pure_nash_enumeration")
    assert result.status == "solved"
    assert result.solution_count == 1

    # Save and Load
    file_path = tmp_path / "game.json"
    client.save_game(game, file_path)
    loaded = client.load_game(file_path)
    assert loaded.id == game.id


def test_storage_and_repository(tmp_path):
    cfg = StorageConfig(base_path=tmp_path / "store")
    storage = FileSystemStorage(cfg)
    repo = GameRepository(storage)

    game_data = {
        "id": "repo_game",
        "name": "Repo Game",
        "players": ["X", "Y"],
        "actions": {"X": ["1", "2"], "Y": ["1", "2"]},
        "payoffs": [[1, 1], [0, 0], [0, 0], [1, 1]],
    }
    game_id = repo.create(game_data)
    assert game_id == "repo_game"

    retrieved = repo.get("repo_game")
    assert retrieved.name == "Repo Game"
    assert len(storage.list_games()) == 1


def test_plugin_registration():
    loader = PluginLoader()

    class MockPlugin(SSEPlugin):
        def metadata(self):
            return PluginMetadata(
                name="mock_plugin",
                version="1.0.0",
                author="Test",
                description="Mock",
                plugin_type="solver",
            )

        def register(self):
            pass

    plugin = MockPlugin()
    loader.register_plugin(plugin)
    assert len(loader.list_plugins()) == 1
    assert loader.get_plugin("mock_plugin") == plugin
