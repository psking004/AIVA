"""SSE Domain Extensions — Application-specific strategic models and scenarios."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from sse.models import FiniteNormalFormGame


class DomainExtension(ABC):
    """Abstract base class for all application domain modules."""

    name: str = ""
    description: str = ""

    @abstractmethod
    def list_scenarios(self) -> list[str]:
        """List scenario factory names available in this domain."""
        ...

    @abstractmethod
    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        """Instantiate a domain game scenario by name."""
        ...


class DomainRegistry:
    """Catalog of registered domain extensions."""

    _domains: ClassVar[dict[str, DomainExtension]] = {}


    @classmethod
    def register(cls, domain: DomainExtension) -> None:
        if not domain.name.strip():
            raise ValueError("Domain must have a non-empty name.")
        cls._domains[domain.name] = domain

    @classmethod
    def get(cls, name: str) -> DomainExtension:
        if name not in cls._domains:
            raise KeyError(
                f"Domain '{name}' not found. Available domains: {list(cls._domains.keys())}"
            )
        return cls._domains[name]

    @classmethod
    def list_domains(cls) -> list[str]:
        return sorted(cls._domains.keys())


# Import and auto-register all domain modules
from sse.domains.autonomous import AutonomousSystemsDomain
from sse.domains.business import BusinessDomain
from sse.domains.cybersecurity import CybersecurityDomain
from sse.domains.economics import EconomicsDomain
from sse.domains.logistics import LogisticsDomain
from sse.domains.social import SocialSystemsDomain
from sse.domains.transportation import TransportationDomain

DomainRegistry.register(CybersecurityDomain())
DomainRegistry.register(EconomicsDomain())
DomainRegistry.register(BusinessDomain())
DomainRegistry.register(LogisticsDomain())
DomainRegistry.register(TransportationDomain())
DomainRegistry.register(SocialSystemsDomain())
DomainRegistry.register(AutonomousSystemsDomain())

__all__ = [
    "AutonomousSystemsDomain",
    "BusinessDomain",
    "CybersecurityDomain",
    "DomainExtension",
    "DomainRegistry",
    "EconomicsDomain",
    "LogisticsDomain",
    "SocialSystemsDomain",
    "TransportationDomain",
]
