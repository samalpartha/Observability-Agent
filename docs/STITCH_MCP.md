# Connect Stitch (with Google) MCP

[Stitch](https://stitch.withgoogle.com) is Google’s design-with-AI tool. You can connect it via MCP (Model Context Protocol) so Cursor or other MCP clients can use Stitch tools.

## 1. Get an API key

- Go to [Stitch](https://stitch.withgoogle.com) and sign in.
- Create or copy an API key (e.g. from account/settings or the [MCP setup docs](https://stitch.withgoogle.com/docs/mcp/setup)).

## 2. Store the key in this project (optional)

If you want the key available for scripts or backend:

- In the project root `.env` (never commit it), add:
  ```bash
  STITCH_API_KEY=your-stitch-api-key-here
  ```
- `.env` is in `.gitignore`; do not add the key to `.env.example` or any tracked file.

## 3. Connect Stitch MCP in Cursor

**Option A – Project config (if Cursor supports it)**  
This repo has `.cursor/mcp.json` with the Stitch server (your key is in it; the file is gitignored). If Cursor reads MCP from the project, it should connect automatically.

**Option B – Cursor Settings**  
- Open **Cursor Settings** → **MCP** (or **Features** → **MCP**).
- Paste the MCP config. Use `.cursor/mcp.json.example` as a template and replace `YOUR-API-KEY` with your Stitch API key, or copy the contents of `.cursor/mcp.json` (local only, not committed) into Cursor’s MCP configuration.

Config shape:
```json
{
  "mcpServers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "YOUR-API-KEY"
      }
    }
  }
}
```

## 4. Security

- Do not commit your Stitch API key or paste it in repo files.
- If the key was ever shared in chat or in a screenshot, rotate it in the Stitch dashboard and update your local `.env` and Cursor MCP config.
