"""Strategic Systems Engine - Payoff Ingestion Compressor & Quantizer.

Provides single-precision (float32) quantization, strategic action-space clustering,
and affine [0, 100] normalization for high-performance downstream equilibrium solving.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

from sse.models import FiniteNormalFormGame, Player

if TYPE_CHECKING:
    from sse.ingestion.payoff_formulator import ContinuousPayoffFormulator


@dataclass(frozen=True, slots=True)
class ActionClusterMapping:
    """Mapping of original action indices into an aggregate cluster."""

    compressed_index: int
    original_indices: tuple[int, ...]
    cluster_name: str


@dataclass(frozen=True, slots=True)
class CompressedMatrixResult:
    """Compressed, quantized, and normalized strategic game representation."""

    compressed_payoffs: np.ndarray  # shape (m', n', 2), dtype np.float32
    mapping_p1: list[ActionClusterMapping]
    mapping_p2: list[ActionClusterMapping]
    original_shape: tuple[int, int]
    compressed_shape: tuple[int, int]
    min_val: float
    max_val: float
    scale_factor: float
    game: FiniteNormalFormGame


class MatrixCompressor:
    """High-performance matrix compaction and quantization engine."""

    def __init__(
        self,
        max_actions: int = 6,
        distance_threshold: float = 1e-3,
        normalize_range: tuple[float, float] = (0.0, 100.0),
    ) -> None:
        """Initialize matrix compressor.

        Args:
            max_actions: Maximum allowed actions per player in compressed matrix.
            distance_threshold: L2 distance threshold below which actions are unconditionally merged.
            normalize_range: Target bounds (min, max) for affine rescaling.
        """
        self.max_actions = max_actions
        self.distance_threshold = distance_threshold
        self.norm_min, self.norm_max = normalize_range

    def _cluster_actions(
        self,
        profiles: np.ndarray,  # shape (k, feature_dim)
        action_names: list[str] | None = None,
    ) -> tuple[np.ndarray, list[tuple[int, ...]]]:
        """Hierarchical agglomerative clustering using L2 Euclidean distance.

        Merges closest action vectors until number of clusters <= max_actions
        and/or pairwise distance exceeds threshold.
        """
        k = profiles.shape[0]
        if k <= self.max_actions and self.distance_threshold <= 0:
            return profiles.copy(), [(i,) for i in range(k)]

        # Initialize clusters: each action is its own cluster
        clusters: list[list[int]] = [[i] for i in range(k)]
        centroids: list[np.ndarray] = [profiles[i].copy() for i in range(k)]

        while len(clusters) > 1:
            n_curr = len(clusters)
            # Find closest pair of centroids
            min_dist = float("inf")
            best_pair = (-1, -1)

            for i in range(n_curr):
                for j in range(i + 1, n_curr):
                    dist = float(np.linalg.norm(centroids[i] - centroids[j]))
                    if dist < min_dist:
                        min_dist = dist
                        best_pair = (i, j)

            # Check stopping criteria
            if n_curr <= self.max_actions and min_dist > self.distance_threshold:
                break

            # Merge best_pair
            i, j = best_pair
            merged_members = clusters[i] + clusters[j]
            # New centroid is the mean of all original member profiles
            merged_centroid = np.mean(profiles[merged_members], axis=0)

            # Update cluster lists
            new_clusters = [clusters[idx] for idx in range(n_curr) if idx not in (i, j)]
            new_centroids = [centroids[idx] for idx in range(n_curr) if idx not in (i, j)]
            new_clusters.append(merged_members)
            new_centroids.append(merged_centroid)

            clusters = new_clusters
            centroids = new_centroids

        # Sort clusters by minimum original action index for deterministic order
        indexed_clusters = sorted(
            [(tuple(c), centroids[idx]) for idx, c in enumerate(clusters)],
            key=lambda pair: min(pair[0]),
        )
        final_members = [c for c, _ in indexed_clusters]
        final_centroids = np.array([cnt for _, cnt in indexed_clusters], dtype=np.float32)

        return final_centroids, final_members

    def compress_matrix(
        self,
        payoff_tensor: np.ndarray,
        p1_action_names: list[str] | None = None,
        p2_action_names: list[str] | None = None,
        game_id: str = "compressed_game",
        game_name: str = "Compressed Strategic Game",
    ) -> CompressedMatrixResult:
        """Compresses, clusters, and quantizes a raw payoff tensor.

        Args:
            payoff_tensor: Payoff array of shape (m, n, 2) or (m, n).
            p1_action_names: Optional labels for P1 actions.
            p2_action_names: Optional labels for P2 actions.
            game_id: Unique identifier for compressed FiniteNormalFormGame.
            game_name: Human-readable name.

        Returns:
            CompressedMatrixResult containing float32 tensor, mappings, and game model.
        """
        # Step 1: Standardize shape to (m, n, 2)
        if payoff_tensor.ndim == 2:
            m, n = payoff_tensor.shape
            tensor = np.zeros((m, n, 2), dtype=np.float32)
            tensor[:, :, 0] = payoff_tensor
            tensor[:, :, 1] = payoff_tensor.T
        elif payoff_tensor.ndim == 3 and payoff_tensor.shape[2] == 2:
            tensor = np.asarray(payoff_tensor, dtype=np.float32)
            m, n = tensor.shape[0], tensor.shape[1]
        else:
            raise ValueError(f"Invalid payoff tensor shape: {payoff_tensor.shape}")

        orig_shape = (m, n)

        # Step 2: Action space clustering for Player 1 (rows) if m > max_actions
        p1_profiles = tensor[:, :, 0]  # P1's payoff under all column responses
        _, p1_clusters = self._cluster_actions(p1_profiles)

        # Step 3: Action space clustering for Player 2 (cols) if n > max_actions
        # P2's profiles across rows
        p2_profiles = tensor[:, :, 1].T  # shape (n, m)
        _, p2_clusters = self._cluster_actions(p2_profiles)

        m_comp = len(p1_clusters)
        n_comp = len(p2_clusters)

        # Aggregate payoffs across clusters by averaging member outcomes
        compressed_tensor = np.zeros((m_comp, n_comp, 2), dtype=np.float32)
        for i_c, c_p1 in enumerate(p1_clusters):
            for j_c, c_p2 in enumerate(p2_clusters):
                submatrix_p1 = tensor[np.ix_(c_p1, c_p2, [0])]
                submatrix_p2 = tensor[np.ix_(c_p1, c_p2, [1])]
                compressed_tensor[i_c, j_c, 0] = float(np.mean(submatrix_p1))
                compressed_tensor[i_c, j_c, 1] = float(np.mean(submatrix_p2))

        # Step 4: Dynamic affine rescaling to [norm_min, norm_max]
        min_val = float(np.min(compressed_tensor))
        max_val = float(np.max(compressed_tensor))
        val_range = max_val - min_val

        if val_range > 1e-7:
            scale_factor = (self.norm_max - self.norm_min) / val_range
            compressed_tensor = (compressed_tensor - min_val) * scale_factor + self.norm_min
        else:
            scale_factor = 1.0
            compressed_tensor.fill((self.norm_min + self.norm_max) / 2.0)

        compressed_tensor = np.asarray(compressed_tensor, dtype=np.float32)

        # Step 5: Build mappings and FiniteNormalFormGame
        mapping_p1: list[ActionClusterMapping] = []
        c_names_p1: list[str] = []
        for idx, members in enumerate(p1_clusters):
            if p1_action_names and len(members) == 1:
                name = p1_action_names[members[0]]
            elif p1_action_names:
                name = f"agg_p1_{idx}[{'+'.join(p1_action_names[m] for m in members)}]"
            else:
                name = f"agg_p1_{idx}"
            mapping_p1.append(ActionClusterMapping(idx, members, name))
            c_names_p1.append(name)

        mapping_p2: list[ActionClusterMapping] = []
        c_names_p2: list[str] = []
        for idx, members in enumerate(p2_clusters):
            if p2_action_names and len(members) == 1:
                name = p2_action_names[members[0]]
            elif p2_action_names:
                name = f"agg_p2_{idx}[{'+'.join(p2_action_names[m] for m in members)}]"
            else:
                name = f"agg_p2_{idx}"
            mapping_p2.append(ActionClusterMapping(idx, members, name))
            c_names_p2.append(name)

        # Create FiniteNormalFormGame
        payoffs_list: list[tuple[float, float]] = []
        for i in range(m_comp):
            for j in range(n_comp):
                payoffs_list.append(
                    (float(compressed_tensor[i, j, 0]), float(compressed_tensor[i, j, 1]))
                )

        game = FiniteNormalFormGame(
            id=game_id,
            name=game_name,
            players=(Player("P1", "Player 1"), Player("P2", "Player 2")),
            actions=(tuple(c_names_p1), tuple(c_names_p2)),
            payoffs=tuple(payoffs_list),
        )

        return CompressedMatrixResult(
            compressed_payoffs=compressed_tensor,
            mapping_p1=mapping_p1,
            mapping_p2=mapping_p2,
            original_shape=orig_shape,
            compressed_shape=(m_comp, n_comp),
            min_val=min_val,
            max_val=max_val,
            scale_factor=scale_factor,
            game=game,
        )

    def compress_from_formulator(
        self,
        player_1_formulator: ContinuousPayoffFormulator,
        player_2_formulator: ContinuousPayoffFormulator,
        interval_p1: tuple[float, float],
        interval_p2: tuple[float, float],
        grid_points_p1: int = 12,
        grid_points_p2: int = 12,
        scheme: str = "uniform",
        game_id: str = "compressed_continuous_game",
    ) -> CompressedMatrixResult:
        """Discretizes continuous utility functions and immediately compresses the resulting matrix."""
        from sse.ingestion.payoff_formulator import ContinuousPayoffFormulator
        from sse.strategic.solvers.exact_solvers import extract_bimatrix

        raw_game = ContinuousPayoffFormulator.discretize_bimatrix_game(
            game_id="raw_grid",
            name="Raw Discretized Grid",
            player_1_formulator=player_1_formulator,
            player_2_formulator=player_2_formulator,
            interval_p1=interval_p1,
            interval_p2=interval_p2,
            grid_points_p1=grid_points_p1,
            grid_points_p2=grid_points_p2,
            scheme=scheme,
        )

        u1, u2 = extract_bimatrix(raw_game)
        tensor = np.stack([u1, u2], axis=-1)
        return self.compress_matrix(
            payoff_tensor=tensor,
            p1_action_names=list(raw_game.actions[0]),
            p2_action_names=list(raw_game.actions[1]),
            game_id=game_id,
            game_name="Compressed Continuous Strategic Game",
        )
