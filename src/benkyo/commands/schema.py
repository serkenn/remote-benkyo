"""schema subcommand: runtime introspection of the CLI surface.

Returns a JSON tree describing every command, subcommand, option, and
argument. Skills can use this to verify the CLI version their cheatsheet
expects against the installed version's actual shape.
"""

import click

from benkyo import __version__
from benkyo._output import output_ok


def _describe_param(param: click.Parameter) -> dict:
    """Return a JSON-serializable description of a Click parameter."""
    info: dict = {
        "name": param.human_readable_name,
    }
    if isinstance(param, click.Option):
        info["kind"] = "option"
        info["flags"] = list(param.opts) + list(param.secondary_opts)
        info["required"] = bool(param.required)
        if param.help:
            info["help"] = param.help
        if param.default is not None and not param.is_flag:
            try:
                info["default"] = (
                    param.default() if callable(param.default) else param.default
                )
            except Exception:
                pass
        if param.is_flag:
            info["is_flag"] = True
        if param.multiple:
            info["multiple"] = True
    elif isinstance(param, click.Argument):
        info["kind"] = "argument"
        info["required"] = bool(param.required)
        if param.nargs and param.nargs != 1:
            info["nargs"] = param.nargs
    info["type"] = getattr(param.type, "name", str(param.type))
    return info


def _describe_command(cmd: click.Command) -> dict:
    """Recursively describe a Click command (Group or Command)."""
    desc: dict = {"name": cmd.name}
    if cmd.help:
        # Click stores the docstring as help; trim and use only the first
        # paragraph to keep the schema readable.
        first_para = cmd.help.split("\n\n", 1)[0].strip()
        desc["help"] = first_para
    desc["params"] = [
        _describe_param(p)
        for p in cmd.params
        if not (isinstance(p, click.Option) and p.hidden)
    ]
    if isinstance(cmd, click.Group):
        desc["subcommands"] = {
            name: _describe_command(sub)
            for name, sub in sorted(cmd.commands.items())
        }
    return desc


def register(cli: click.Group) -> None:
    """Attach the `benkyo schema` command to the cli group."""

    @cli.command(name="schema")
    @click.pass_context
    def schema_cmd(ctx):
        """Print the full CLI surface as JSON for skill-side introspection."""
        root = ctx.find_root().command
        output_ok(
            {
                "version": __version__,
                "cli": _describe_command(root),
            }
        )
