"""AIVA Vault & OAuth Onboarding CLI Subsystem.

Provides interactive commands for:
- Initializing AES-256-GCM credential vault (`sse vault init`)
- Storing secrets under opaque handles (`sse vault set`)
- Listing stored handles without plaintext exposure (`sse vault list`)
- Zero-password OAuth 2.0 PKCE account linking (`sse oauth link`)
"""

from __future__ import annotations

import getpass
import os
import webbrowser
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from aiva.integrations.oauth_broker import OAuthBroker
from aiva.security.vault import DEFAULT_VAULT_FILENAME, SecureCredentialVault

console = Console()

vault_cli_app = typer.Typer(
    name="vault",
    help="Manage zero-leak encrypted credential vault (AES-256-GCM).",
    no_args_is_help=True,
)

oauth_cli_app = typer.Typer(
    name="oauth",
    help="Manage zero-password OAuth 2.0 PKCE account connections.",
    no_args_is_help=True,
)


def _resolve_master_passphrase(passphrase: str | None) -> str:
    """Prompt for master passphrase if not provided via argument or environment."""
    if passphrase:
        return passphrase
    env_pass = os.getenv("AIVA_MASTER_SECRET")
    if env_pass:
        return env_pass
    return getpass.getpass("Enter Vault Master Passphrase: ")


@vault_cli_app.command("init")
def vault_init_cmd(
    vault_path: str | None = typer.Option(
        None,
        "--vault-path",
        "-p",
        help="Path for encrypted vault file",
    ),
    passphrase: str | None = typer.Option(
        None,
        "--passphrase",
        help="Master passphrase (will prompt securely if omitted)",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Overwrite existing vault file if present",
    ),
) -> None:
    """Initialize a new zero-leak AES-256-GCM credential vault."""
    target_vault = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)
    if target_vault.exists() and not force:
        console.print(f"[bold red]Vault file already exists at {target_vault}. Use --force to overwrite.[/bold red]")
        raise typer.Exit(code=1)

    master_secret = _resolve_master_passphrase(passphrase)
    if len(master_secret) < 8:
        console.print("[bold red]Master passphrase must be at least 8 characters.[/bold red]")
        raise typer.Exit(code=1)

    # Instantiate and save verified empty vault
    vault = SecureCredentialVault(vault_path=target_vault, master_secret=master_secret, auto_load=False)
    vault.save()

    console.print(f"[bold green]Vault initialized successfully at [cyan]{target_vault}[/cyan][/bold green]")
    console.print("[dim]Derived key: PBKDF2-HMAC-SHA256 (100,000 iterations). Authenticated AES-256-GCM cipher.[/dim]")


@vault_cli_app.command("set")
def vault_set_cmd(
    category: str = typer.Option(..., "--category", "-c", help="Category (e.g. credentials, tokens, api_keys)"),
    service: str = typer.Option(..., "--service", "-s", help="Service name (e.g. github, google, internal)"),
    key: str = typer.Option(..., "--key", "-k", help="Secret key name (e.g. token, password)"),
    value: str | None = typer.Option(None, "--value", help="Secret value (will prompt securely if omitted)"),
    vault_path: str | None = typer.Option(None, "--vault-path", "-p", help="Vault file path"),
    passphrase: str | None = typer.Option(None, "--passphrase", help="Master passphrase"),
) -> None:
    """Store secret under opaque handle vault://<category>/<service>/<key> without plaintext leakage."""
    master_secret = _resolve_master_passphrase(passphrase)
    target_vault = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)

    try:
        vault = SecureCredentialVault(vault_path=target_vault, master_secret=master_secret)
    except PermissionError:
        console.print("[bold red]Failed to unlock vault: invalid master passphrase or corrupted ciphertext.[/bold red]")
        raise typer.Exit(code=1)

    secret_val = value if value is not None else getpass.getpass(f"Enter secret for [{service}/{key}]: ")
    handle = f"vault://{category.strip()}/{service.strip()}/{key.strip()}"

    vault.store_secret(handle, secret_val)
    console.print(f"[bold green]Stored secret securely under handle: [cyan]{handle}[/cyan][/bold green]")


@vault_cli_app.command("list")
def vault_list_cmd(
    vault_path: str | None = typer.Option(None, "--vault-path", "-p", help="Vault file path"),
    passphrase: str | None = typer.Option(None, "--passphrase", help="Master passphrase"),
) -> None:
    """List all stored opaque secret handles without disclosing plaintext values."""
    target_vault = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)
    if not target_vault.exists():
        console.print(f"[bold yellow]Vault file not found at {target_vault}. Run 'sse vault init' first.[/bold yellow]")
        raise typer.Exit(code=1)

    master_secret = _resolve_master_passphrase(passphrase)
    try:
        vault = SecureCredentialVault(vault_path=target_vault, master_secret=master_secret)
    except PermissionError:
        console.print("[bold red]Failed to unlock vault: invalid master passphrase.[/bold red]")
        raise typer.Exit(code=1)

    handles = vault.list_handles()
    table = Table(title=f"Encrypted Vault Handles ({len(handles)} entries)", border_style="cyan")
    table.add_column("Handle URI", style="bold green")
    table.add_column("Status", style="yellow")

    for h in handles:
        table.add_row(h, "SEALED (AES-256-GCM)")

    console.print(table)


@oauth_cli_app.command("link")
def oauth_link_cmd(
    service: str = typer.Option("github", "--service", "-s", help="Service to link: github or google"),
    client_id: str = typer.Option(..., "--client-id", help="OAuth App Client ID"),
    client_secret: str = typer.Option(..., "--client-secret", help="OAuth App Client Secret"),
    vault_path: str | None = typer.Option(None, "--vault-path", "-p", help="Vault file path"),
    passphrase: str | None = typer.Option(None, "--passphrase", help="Vault master passphrase"),
    port: int = typer.Option(8765, "--port", help="Loopback callback port"),
    no_browser: bool = typer.Option(False, "--no-browser", help="Do not automatically launch system browser"),
) -> None:
    """Connect external account via zero-password OAuth 2.0 PKCE flow."""
    master_secret = _resolve_master_passphrase(passphrase)
    target_vault = Path(vault_path) if vault_path else Path(DEFAULT_VAULT_FILENAME)
    try:
        vault = SecureCredentialVault(vault_path=target_vault, master_secret=master_secret)
    except PermissionError:
        console.print("[bold red]Failed to unlock vault.[/bold red]")
        raise typer.Exit(code=1)

    broker = OAuthBroker(vault=vault, callback_port=port)
    verifier, challenge = broker.generate_pkce_pair()
    state = f"st_{os.urandom(8).hex()}"

    auth_url = broker.get_authorization_url(
        service=service,
        client_id=client_id,
        code_challenge=challenge,
        state=state,
    )

    console.print(f"[bold cyan]Opening OAuth Authorization Flow for [green]{service.upper()}[/green]...[/bold cyan]")
    console.print(f"[dim]Callback listener active on http://127.0.0.1:{port}/callback[/dim]")

    if not no_browser:
        webbrowser.open(auth_url)
    else:
        console.print(f"Please navigate to the following URL in your browser:\n[cyan]{auth_url}[/cyan]")

    try:
        code = broker.listen_for_callback(timeout_sec=120.0)
    except TimeoutError:
        console.print("[bold red]Authorization timed out after 120 seconds.[/bold red]")
        raise typer.Exit(code=1)

    console.print("[bold green]Authorization code received. Exchanging for tokens...[/bold green]")
    tokens = broker.exchange_code_for_tokens(
        service=service,
        client_id=client_id,
        client_secret=client_secret,
        code=code,
        code_verifier=verifier,
    )

    console.print(
        f"[bold green]Account linked successfully![/bold green] Tokens stored in vault under "
        f"[cyan]{tokens['access_token_handle']}[/cyan]"
    )
