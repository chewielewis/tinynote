#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "mcp>=1.0.0",
#   "httpx>=0.27",
# ]
# ///

import asyncio
import os
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

TINYNOTE_URL = os.environ.get("TINYNOTE_URL", "http://localhost:4444")

PRINT_RULES = """
Epson TM-T30 thermal printer on 80mm paper. Format rules:

LINE WIDTH: 32 characters max. Hard-wrap anything longer — the printer does
not soft-wrap, long lines get cut off.

LENGTH: Aim for under 40 lines total. There is no preview; once printed it
cannot be undone.

CHARACTERS: Plain ASCII only. No emoji, no box-drawing chars (│─┌┐└┘ etc),
no markdown symbols (**, __, ##). These print as garbage or are stripped.

SEPARATORS: Use plain dashes: --------------------------------

HEADERS: ALL CAPS or Title Case on its own line, followed by a dash line.
  SHOPPING LIST
  --------------------------------

LISTS: Simple dash or number prefix, one item per line.
  - Milk
  - Eggs
  1. First step
  2. Second step

ALIGNMENT: left for body text, center for titles/short labels, right rarely.

SPACING: Blank lines between sections read well. Do not indent with spaces
(the narrow width makes indented text feel cramped).

WHAT WORKS WELL:
  - Short lists (groceries, tasks, steps)
  - Recipes with ingredients + numbered steps
  - Brief notes or reminders
  - Simple tables using spaces to align two columns
  - Dates, times, names

WHAT DOES NOT WORK:
  - Long paragraphs (wrap them into short lines instead)
  - Tables with more than 2 columns (too wide)
  - Markdown formatting of any kind
  - Emoji or unicode symbols
  - Code blocks with indentation (collapses badly)
"""

server = Server("tinynote")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="tinynote_print",
            description=(
                "Print text to the Epson TM-T30 thermal printer (80mm paper).\n\n"
                "YOU MUST FORMAT THE MESSAGE BEFORE CALLING THIS TOOL. "
                "The printer has no layout engine — what you send is what prints.\n"
                + PRINT_RULES
            ),
            inputSchema={
                "type": "object",
                "required": ["message"],
                "properties": {
                    "message": {
                        "type": "string",
                        "description": (
                            "Pre-formatted plain text ready to print. "
                            "Max 32 chars per line, hard-wrapped. No markdown."
                        )
                    },
                    "align": {
                        "type": "string",
                        "enum": ["left", "center", "right"],
                        "default": "left",
                        "description": "Global text alignment for this print job."
                    }
                }
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "tinynote_print":
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{TINYNOTE_URL}/print",
                json={
                    "message": arguments["message"],
                    "align": arguments.get("align", "left"),
                }
            )
            resp.raise_for_status()
            data = resp.json()
            return [types.TextContent(type="text", text=data.get("message", "Printed."))]

    raise ValueError(f"Unknown tool: {name}")


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
