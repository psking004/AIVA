import random

import pytest

from sse.core.actions import (
    ContinuousActionSpace,
    DiscreteActionSpace,
    ProductActionSpace,
)


def test_discrete_action_space():
    space = DiscreteActionSpace(("Cooperate", "Defect"))
    assert space.is_finite
    assert space.size == 2
    assert space.contains("Cooperate")
    assert not space.contains("Invalid")
    assert space.to_list() == ["Cooperate", "Defect"]

    rng = random.Random(42)
    sample = space.sample(rng)
    assert sample in ("Cooperate", "Defect")


def test_discrete_action_space_validation():
    with pytest.raises(ValueError):
        DiscreteActionSpace(())  # empty
    with pytest.raises(ValueError):
        DiscreteActionSpace(("A", "A"))  # duplicate


def test_continuous_action_space():
    space = ContinuousActionSpace(0.0, 1.0)
    assert not space.is_finite
    assert space.contains(0.5)
    assert space.contains(0.0)
    assert space.contains(1.0)
    assert not space.contains(1.5)

    rng = random.Random(42)
    val = space.sample(rng)
    assert 0.0 <= val <= 1.0


def test_product_action_space():
    s1 = DiscreteActionSpace(("Up", "Down"))
    s2 = DiscreteActionSpace(("Left", "Right"))
    prod = ProductActionSpace((s1, s2))
    assert prod.is_finite
    assert prod.size == 4
    assert prod.contains(("Up", "Left"))
    assert not prod.contains(("Up", "Center"))
